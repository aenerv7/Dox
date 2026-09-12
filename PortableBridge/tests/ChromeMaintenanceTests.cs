using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Win32;

namespace PortableBrowserBridge
{
    internal static partial class Program
    {
        private static ChromeRegistryBaseline TestBaseline(RegistryKey sandbox, string root)
        {
            return new ChromeRegistryBaseline {
                Version = 1, CohortId = Guid.NewGuid().ToString("D"), Root = root,
                Views = new[] {
                    ChromeMaintenance.CaptureView(sandbox, root, (int)RegistryView.Registry64),
                    ChromeMaintenance.CaptureView(sandbox, root, (int)RegistryView.Registry32)
                }
            };
        }

        private static bool RegistryExists(RegistryKey sandbox, string path)
        {
            using (RegistryKey key = sandbox.OpenSubKey(path)) return key != null;
        }

        private static void SetRegistry(RegistryKey sandbox, string path, string name, object value, RegistryValueKind kind)
        {
            using (RegistryKey key = sandbox.CreateSubKey(path)) key.SetValue(name, value, kind);
        }

        private static void RunChromeMaintenanceTests(string work, string chromePath)
        {
            // All registry writes stay beneath this isolated test key. No real Google,
            // Chromium, default-browser or machine-level keys are changed.
            string testKey = @"Software\PortableBridge.Tests\" + Guid.NewGuid().ToString("N");
            using (RegistryKey hkcu = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64))
            try
            {
                using (RegistryKey sandbox = hkcu.CreateSubKey(testKey))
                {
                    const string root = @"Software\Google\Chrome SxS";
                    ChromeRegistryBaseline empty = TestBaseline(sandbox, root);
                    SetRegistry(sandbox, root + @"\BLBeacon", "version", "155.0", RegistryValueKind.String);
                    SetRegistry(sandbox, root + @"\PreferenceMACs\profile", "mac", new byte[] { 1, 2 }, RegistryValueKind.Binary);
                    SetRegistry(sandbox, root + @"\StabilityMetrics", "crashes", 1, RegistryValueKind.DWord);
                    SetRegistry(sandbox, root + @"\ThirdParty\child", "value", 1L, RegistryValueKind.QWord);
                    SetRegistry(sandbox, root, "UsageStatsInSample", 1, RegistryValueKind.DWord);
                    ChromeMaintenance.CleanupView(sandbox, root, empty.Views[0]);
                    Check(!RegistryExists(sandbox, root) && !RegistryExists(sandbox, @"Software\Google"),
                        "New Canary whitelist nodes and empty new parents are removed");
                    ChromeMaintenance.CleanupView(sandbox, root, empty.Views[0]);
                    Check(!RegistryExists(sandbox, root), "Cleanup is idempotent after partial/repeated completion");

                    SetRegistry(sandbox, root + @"\BLBeacon", "existing", "original", RegistryValueKind.String);
                    using (RegistryKey key = sandbox.CreateSubKey(root + @"\ThirdParty\empty-before")) { }
                    SetRegistry(sandbox, root + @"\NativeMessagingHosts\host", "", "host.json", RegistryValueKind.String);
                    SetRegistry(sandbox, root, "UsageStatsInSample", 1, RegistryValueKind.DWord);
                    ChromeRegistryBaseline previous = TestBaseline(sandbox, root);
                    SetRegistry(sandbox, root + @"\BLBeacon", "existing", "changed", RegistryValueKind.String);
                    SetRegistry(sandbox, root + @"\BLBeacon", "new", "new", RegistryValueKind.String);
                    SetRegistry(sandbox, root + @"\NativeMessagingHosts\new-host", "", "new.json", RegistryValueKind.String);
                    SetRegistry(sandbox, root + @"\Unrelated", "leave", 1, RegistryValueKind.DWord);
                    SetRegistry(sandbox, @"Software\Google\Update", "version", "keep", RegistryValueKind.String);
                    ChromeMaintenance.CleanupView(sandbox, root, previous.Views[0]);
                    using (RegistryKey key = sandbox.OpenSubKey(root + @"\BLBeacon"))
                        Check((string)key.GetValue("existing") == "changed" && key.GetValue("new") == null,
                            "Existing values are not reverted; only new whitelist values are removed");
                    Check(RegistryExists(sandbox, root + @"\ThirdParty\empty-before"), "Preexisting empty key preserved");
                    Check(RegistryExists(sandbox, root + @"\NativeMessagingHosts\new-host") &&
                        RegistryExists(sandbox, root + @"\Unrelated") && RegistryExists(sandbox, @"Software\Google\Update"),
                        "Native hosts, nonallowlisted keys and Google Update preserved");
                    using (RegistryKey key = sandbox.OpenSubKey(root))
                        Check((int)key.GetValue("UsageStatsInSample") == 1, "Preexisting root value preserved");

                    const string testingRoot = @"Software\Google\Chrome for Testing";
                    ChromeRegistryBaseline testing = TestBaseline(sandbox, testingRoot);
                    SetRegistry(sandbox, testingRoot + @"\BLBeacon", "version", "153.0", RegistryValueKind.String);
                    ChromeMaintenance.CleanupView(sandbox, testingRoot, testing.Views[1]);
                    Check(!RegistryExists(sandbox, testingRoot), "Chrome for Testing delta cleanup supported");
                    Check(RegistryExists(sandbox, root), "Another product root is untouched");

                    bool rejected = false;
                    try { ChromeMaintenance.CaptureView(sandbox, @"Software\Google", (int)RegistryView.Registry64); }
                    catch (InvalidDataException) { rejected = true; }
                    Check(rejected, "Broad registry roots rejected");
                    testing.Views[0].Keys = new[] { new ChromeRegistryKeyBaseline {
                        Path = @"..\Update", Values = new string[0] } };
                    rejected = false;
                    try { ChromeMaintenance.Validate(testing); } catch (InvalidDataException) { rejected = true; }
                    Check(rejected, "Tampered baseline path rejected before deletion");

                    // Durable cohort lifecycle: peer exit, last-member failure/retry,
                    // capture-before-ack, unsafe detection and monitor recovery.
                    BridgeContext context = new BridgeContext {
                        StatePath = Path.Combine(work, "chrome-registry-sessions.json"),
                        BridgePath = chromePath,
                        StateMutexName = "Local\\PortableBridge-Registry-Test-" + Guid.NewGuid().ToString("N")
                    };
                    int captures = 0, cleanups = 0;
                    bool failCleanup = true, taint = false;
                    context.Operations.CaptureChrome = delegate(SessionState state, List<SessionState> peers) {
                        foreach (SessionState peer in peers)
                            if (peer.ChromeRegistry != null) return peer.ChromeRegistry;
                        captures++;
                        return TestBaseline(sandbox, root);
                    };
                    context.Operations.ObserveChrome = delegate(List<SessionState> peers) {
                        if (!taint) return false;
                        foreach (SessionState peer in peers) if (peer.ChromeRegistry != null) peer.ChromeRegistry.Unsafe = true;
                        return true;
                    };
                    context.Operations.Query = delegate(SessionState state, out bool succeeded) { succeeded = true; return false; };
                    context.Operations.Prepare = delegate { };
                    context.Operations.Cleanup = delegate { };
                    context.Operations.CleanupChrome = delegate(SessionState state, List<SessionState> peers) {
                        if (state.ChromeRegistry == null || state.ChromeRegistry.Unsafe) return;
                        if (peers.Exists(delegate(SessionState peer) {
                            return peer.SessionId != state.SessionId && peer.ChromeRegistry != null &&
                                peer.ChromeRegistry.CohortId == state.ChromeRegistry.CohortId; })) {
                            ChromeMaintenance.Cleanup(state, peers); // Real peer deferral must not touch registry.
                            return;
                        }
                        if (failCleanup) throw new IOException("Simulated registry access failure");
                        cleanups++;
                        ChromeMaintenance.CleanupView(sandbox, root, state.ChromeRegistry.Views[0]);
                    };
                    string p1 = Path.Combine(work, "registry-profile-1"), p2 = Path.Combine(work, "registry-profile-2");
                    Directory.CreateDirectory(p1); Directory.CreateDirectory(p2);
                    Announcement a1 = new Announcement { Browser = "chrome", BrowserPath = chromePath, ProfilePath = p1 };
                    Announcement a2 = new Announcement { Browser = "chrome", BrowserPath = chromePath, ProfilePath = p2 };
                    Check(HandleAnnouncement(context, a1) == 0, "First Chrome baseline accepted");
                    SetRegistry(sandbox, root + @"\StabilityMetrics", "new-session-value", 1, RegistryValueKind.DWord);
                    Check(HandleAnnouncement(context, a2) == 0 && captures == 1, "Overlapping profiles reuse first baseline");
                    List<SessionState> states = ReadSessions(context.StatePath);
                    Check(states[0].ChromeRegistry.CohortId == states[1].ChromeRegistry.CohortId,
                        "Shared cohort and registry snapshots persist before successful announcement");
                    List<SessionState> corrupt = ReadSessions(context.StatePath);
                    corrupt[1].ChromeRegistry.CohortId = Guid.NewGuid().ToString("D");
                    Reject(delegate { ValidateStore(new SessionStore { SchemaVersion = CurrentSchemaVersion, Sessions = corrupt.ToArray() }); },
                        "Inconsistent cohort identity in persisted sessions rejected");
                    Check(HandleAnnouncement(context, a1) == 0 && captures == 1, "Repeated announcement never recaptures baseline");
                    EndSession(context, states[0].SessionId);
                    Check(cleanups == 0 && RegistryExists(sandbox, root + @"\StabilityMetrics"),
                        "First profile exit does not clean another profile's shared state");
                    EndSession(context, states[1].SessionId);
                    Check(ReadSessions(context.StatePath)[0].Phase == CleaningPhase, "Registry failure retains cleaning state for retry");
                    failCleanup = false;
                    EndSession(context, states[1].SessionId);
                    Check(cleanups == 1 && !File.Exists(context.StatePath) &&
                        !RegistryExists(sandbox, root + @"\StabilityMetrics"), "Last exit retries and removes only its registry delta");

                    Check(HandleAnnouncement(context, a1) == 0, "New cohort starts after previous cleanup");
                    taint = true;
                    DateTime next = DateTime.MinValue;
                    RefreshSessions(context, ref next);
                    SessionState unsafeState = ReadSessions(context.StatePath)[0];
                    Check(unsafeState.ChromeRegistry.Unsafe, "Attribution uncertainty is persisted");
                    ChromeMaintenance.Cleanup(unsafeState, new List<SessionState> { unsafeState });
                    EndSession(context, unsafeState.SessionId);
                    Check(cleanups == 1, "Unsafe cohort skips destructive cleanup");

                    taint = false;
                    Check(HandleAnnouncement(context, a1) == 0, "Recovery fixture announced");
                    InvalidateRecoveredChromeBaselines(context);
                    Check(ReadSessions(context.StatePath)[0].ChromeRegistry.Unsafe, "Monitor downtime invalidates attribution");
                    EndSession(context, ReadSessions(context.StatePath)[0].SessionId);
                    Check(!File.Exists(context.StatePath), "Recovered unsafe session can finish without deleting registry");
                }
            }
            finally
            {
                hkcu.DeleteSubKeyTree(testKey, false);
                bool empty;
                using (RegistryKey parent = hkcu.OpenSubKey(@"Software\PortableBridge.Tests"))
                    empty = parent != null && parent.SubKeyCount == 0 && parent.ValueCount == 0;
                if (empty) hkcu.DeleteSubKey(@"Software\PortableBridge.Tests", false);
            }
        }
    }
}
