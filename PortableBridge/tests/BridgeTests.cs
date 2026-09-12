using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;

namespace PortableBrowserBridge
{
    internal static class TestRunner
    {
        private static int Main(string[] args)
        {
            if (Array.IndexOf(args, "--bridge-test-child") >= 0) { Thread.Sleep(30000); return 0; }
            try { Program.RunTests(); return 0; }
            catch (Exception exception) { Console.Error.WriteLine(exception); return 1; }
        }
    }

    internal static partial class Program
    {
        private static int assertions;
        private static void Check(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
            assertions++;
        }

        private static void Reject(Action action, string message)
        {
            bool rejected = false;
            try { action(); } catch (InvalidOperationException) { rejected = true; }
            Check(rejected, message);
        }

        internal static void RunTests()
        {
            string work = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "run-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(work);
            try
            {
                string profile = Path.Combine(work, "数据 with spaces");
                Directory.CreateDirectory(profile);
                string chromePath = Process.GetCurrentProcess().MainModule.FileName;
                string firefoxPath = Path.Combine(work, "firefox.exe");
                File.WriteAllBytes(firefoxPath, new byte[0]);
                SessionState firefox = NewTestState("firefox", firefoxPath, profile);
                SessionState chrome = NewTestState("chrome", chromePath, profile);
                string prefix = QuoteArgument(chromePath) + " ";
                Check(BrowserSupport.MatchesCommandLine("firefox.exe --profile " + QuoteArgument(profile), firefox), "Firefox explicit profile");
                Check(BrowserSupport.MatchesCommandLine("firefox.exe -profile " + QuoteArgument(profile), firefox), "Firefox single-dash profile");
                Check(!BrowserSupport.MatchesCommandLine("firefox.exe --profile " + QuoteArgument(profile) + " -contentproc", firefox), "Firefox child excluded");
                Check(!BrowserSupport.MatchesCommandLine("firefox.exe --profile " + QuoteArgument(profile) + " --no-remote", firefox), "Firefox no-remote excluded");
                Check(!BrowserSupport.MatchesCommandLine("firefox.exe --profile " + QuoteArgument(profile) + " -url https://example.com", firefox), "Firefox URL helper excluded");
                Check(BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir=" + QuoteArgument(profile), chrome), "Chrome equals option");
                Check(BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir " + QuoteArgument(profile), chrome), "Chrome separate option");
                Check(!BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir=" + QuoteArgument(profile) + " --type=renderer", chrome), "Chrome renderer excluded");
                Check(!BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir=" + QuoteArgument(profile) + " --type gpu-process", chrome), "Chrome GPU excluded");
                Check(!BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir=" + QuoteArgument(profile + "-other"), chrome), "Different profile excluded");
                Check(!BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir=relative", chrome), "Relative profile excluded");
                chrome.ProfileDirectory = "Profile 1";
                Check(!BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir=" + QuoteArgument(profile), chrome), "Explicit Chrome profile required");
                Check(BrowserSupport.MatchesCommandLine(prefix + "--user-data-dir=" + QuoteArgument(profile) + " --profile-directory=\"Profile 1\"", chrome), "Chrome profile-directory match");
                string url = "https://example.com/a?x=1&y=%22quoted%22#fragment";
                string[] launch = ParseCommandLine(prefix + BrowserSupport.CreateArguments(chrome, url));
                Check(launch.Length == 4 && launch[1] == "--user-data-dir=" + profile && launch[2] == "--profile-directory=Profile 1" && launch[3] == url, "Chrome URL and paths survive Windows quoting");
                launch = ParseCommandLine("firefox.exe " + BrowserSupport.CreateArguments(firefox, url));
                Check(launch.Length == 5 && launch[2] == profile && launch[4] == url, "Firefox URL arguments");
                foreach (string argument in new[] { "", "C:\\space dir\\", "a\\\"b", "中文 & $(value)" })
                    Check(ParseCommandLine("test.exe " + QuoteArgument(argument))[1] == argument, "Argument round trip");
                Uri parsed;
                Check(TryValidateUrl(url, out parsed), "HTTP URL accepted");
                Check(!TryValidateUrl("file:///C:/test", out parsed) && !TryValidateUrl("https://example.com/\n", out parsed) &&
                    !TryValidateUrl("https://example.com/" + new string('a', 32768), out parsed), "Invalid URLs rejected");
                Check(!BrowserSupport.ValidProfileDirectory("chrome", "../Default") &&
                    !BrowserSupport.ValidProfileDirectory("firefox", "Default"), "Invalid profile-directory rejected");
                Check(!BrowserSupport.IsAbsolutePath("C:relative") && !BrowserSupport.IsAbsolutePath(@"\relative"), "Drive-relative paths rejected");
                foreach (bool version3 in new[] { false, true })
                {
                    using (MemoryStream payload = new MemoryStream())
                    using (BinaryWriter writer = new BinaryWriter(payload, Encoding.UTF8, true))
                    using (BinaryReader reader = new BinaryReader(payload, Encoding.UTF8, true))
                    {
                        if (version3) writer.Write("chrome");
                        writer.Write(version3 ? chromePath : firefoxPath); writer.Write(profile);
                        if (version3) writer.Write("Profile 1");
                        writer.Flush(); payload.Position = 0;
                        Announcement decoded = ReadAnnouncement(reader, version3);
                        Check(decoded.Browser == (version3 ? "chrome" : "firefox") && decoded.ProfilePath == profile &&
                            decoded.ProfileDirectory == (version3 ? "Profile 1" : null), "Legacy v2 and generic v3 announcement decoding");
                    }
                }

                BridgeContext context = new BridgeContext { StatePath = Path.Combine(work, "runtime-session.json"),
                    BridgePath = chromePath, StateMutexName = "Local\\PortableBridge-Test-" + Guid.NewGuid().ToString("N") };
                Announcement announcement = new Announcement { Browser = "chrome", BrowserPath = chromePath, ProfilePath = profile };
                Check(HandleAnnouncement(context, announcement) == 0, "Chrome announcement accepted without Mozilla maintenance");
                SessionState first = ReadSessions(context.StatePath)[0];
                Check(first.EnvironmentVariables.Length == 0 && !File.Exists(Path.Combine(work, "runtime-baseline.json")), "Chrome gets no Mozilla environment or baseline");
                Check(HandleAnnouncement(context, announcement) == 0 && ReadSessions(context.StatePath)[0].SessionId == first.SessionId, "Pending announcement is idempotent");
                announcement.ProfileDirectory = "Default";
                Check(HandleAnnouncement(context, announcement) == 73, "Same Chrome user-data-dir cannot be claimed twice");
                announcement.ProfileDirectory = null;
                string profile2 = Path.Combine(work, "second"); Directory.CreateDirectory(profile2);
                announcement.ProfilePath = profile2;
                Check(HandleAnnouncement(context, announcement) == 0 && ReadSessions(context.StatePath).Count == 2, "Second independent session accepted");
                SessionState second = ReadSessions(context.StatePath)[1];
                first.StartedUtc = DateTime.UtcNow.AddMinutes(-2).ToString("o", CultureInfo.InvariantCulture);
                second.StartedUtc = DateTime.UtcNow.AddMinutes(-1).ToString("o", CultureInfo.InvariantCulture);
                Check(SelectLatestSession(new List<SessionState> { second, first }).SessionId == second.SessionId, "Newest process wins regardless of list order");
                Check(SelectLatestSession(new List<SessionState> { first }).SessionId == first.SessionId, "Exit restores remaining session");
                Check(SelectLatestSession(new List<SessionState>()) == null, "No running sessions means idle");
                first.Phase = ActivePhase; first.ExpiresUtc = null; first.FallbackActive = true;
                first.Schemes = new[] { new SchemeState { Scheme = "http" }, new SchemeState { Scheme = "https" } };
                WriteStateAtomic(context.StatePath, first);
                second.Phase = ActivePhase; second.ExpiresUtc = null; second.FallbackActive = true; second.Schemes = first.Schemes;
                Reject(delegate { WriteStateAtomic(context.StatePath, second); }, "Two active protocol owners rejected atomically");
                Check(ReadSessions(context.StatePath).Count == 2 && ReadSession(context.StatePath, second.SessionId).Phase == PendingPhase, "Failed store update preserves valid state");
                first.Phase = StandbyPhase; first.FallbackActive = false; WriteStateAtomic(context.StatePath, first);
                WriteStateAtomic(context.StatePath, second);
                Check(ReadSession(context.StatePath, first.SessionId).Phase == StandbyPhase && ReadSession(context.StatePath, second.SessionId).Phase == ActivePhase, "Switch state survives serialization");
                RemoveSession(context.StatePath, second.SessionId);
                Check(ReadSessions(context.StatePath).Count == 1, "Removing one session preserves the other");
                RemoveSession(context.StatePath, first.SessionId);
                Check(!File.Exists(context.StatePath), "Last removal deletes runtime state");
                File.WriteAllText(context.StatePath, "{\"SchemaVersion\":1,\"FirefoxPath\":\"old\"}");
                Reject(delegate { ReadSessions(context.StatePath); }, "Old active state rejected without silent overwrite");
                File.Delete(context.StatePath);

                chrome.ProfileDirectory = null;
                bool querySucceeded;
                using (Process child = Process.Start(new ProcessStartInfo { FileName = chromePath,
                    Arguments = "--bridge-test-child --user-data-dir=" + QuoteArgument(profile), UseShellExecute = false,
                    CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden }))
                {
                    try
                    {
                        Check(IsAnnouncedBrowserRunning(chrome, out querySucceeded) && querySucceeded && chrome.StartedUtc != null, "Real WMI matches exact Chrome executable and profile");
                        string originalStart = chrome.StartedUtc;
                        using (Process helper = Process.Start(new ProcessStartInfo { FileName = chromePath,
                            Arguments = "--bridge-test-child --user-data-dir=" + QuoteArgument(profile) + " https://example.com/", UseShellExecute = false,
                            CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden }))
                        {
                            try
                            {
                                Check(IsAnnouncedBrowserRunning(chrome, out querySucceeded) && chrome.StartedUtc == originalStart, "URL helper cannot refresh session priority");
                                child.Kill(); child.WaitForExit();
                                Check(!IsAnnouncedBrowserRunning(chrome, out querySucceeded) && querySucceeded, "Surviving URL helper cannot replace the bound main process");
                            }
                            finally { if (!helper.HasExited) helper.Kill(); helper.WaitForExit(); }
                        }
                        chrome.ProfilePath = profile2;
                        Check(!IsAnnouncedBrowserRunning(chrome, out querySucceeded) && querySucceeded, "Real WMI excludes another profile");
                    }
                    finally { if (!child.HasExited) child.Kill(); child.WaitForExit(); }
                }
                RunLifecycleTests(context, firefoxPath, chromePath, work);
                RunChromeMaintenanceTests(work, chromePath);
                Console.WriteLine("Passed " + assertions + " assertions (no system protocol changes).");
            }
            finally { Directory.Delete(work, true); }
        }

        private static SessionState NewTestState(string browser, string executable, string profile)
        {
            return new SessionState { Browser = browser, BrowserPath = executable, ProfilePath = profile };
        }

        private static void RunLifecycleTests(BridgeContext context, string firefoxPath, string chromePath, string work)
        {
            Dictionary<string, string> running = new Dictionary<string, string>();
            List<string> cleaned = new List<string>();
            bool queryUnknown = false;
            bool releaseAllowed = true;
            bool firefoxCleanupFails = false;
            bool prepareFails = false;
            context.Operations = new SessionOperations
            {
                Query = delegate(SessionState state, out bool succeeded)
                {
                    succeeded = !queryUnknown;
                    string started;
                    if (!succeeded || !running.TryGetValue(state.ProfilePath, out started)) return false;
                    if (state.StartedUtc != null && state.StartedUtc != started) return false;
                    state.StartedUtc = started;
                    return true;
                },
                Prepare = delegate { if (prepareFails) throw new InvalidOperationException("Simulated preparation failure"); },
                Cleanup = delegate(SessionState state)
                {
                    Check(!running.ContainsKey(state.ProfilePath), "Maintenance only runs after process exit");
                    if (state.Browser == "firefox" && firefoxCleanupFails) throw new IOException("Simulated cleanup failure");
                    cleaned.Add(state.Browser);
                },
                ReleaseProtocols = delegate(SessionState state)
                {
                    SessionState persisted = ReadSession(context.StatePath, state.SessionId);
                    Check(!persisted.FallbackActive && !persisted.ProtocolFallbackActive, "Disable delivery is persisted before protocol release");
                    return releaseAllowed;
                },
                InspectSchemes = delegate { return new List<SchemeState> { new SchemeState { Scheme = "http" }, new SchemeState { Scheme = "https" } }; },
                RemoveStaleChoices = delegate { },
                EnsureProtocols = delegate(BridgeContext target, SessionState state)
                {
                    Check(ReadSessions(target.StatePath).FindAll(delegate(SessionState entry) { return entry.Phase == ActivePhase; }).Count == 1,
                        "Exactly one owner exists at protocol activation");
                    state.MachineFallbackCreated = true; state.ProtocolFallbackActive = true;
                    WriteStateAtomic(target.StatePath, state);
                }
            };
            string firefoxProfile = Path.Combine(work, "Firefox Profile"); Directory.CreateDirectory(firefoxProfile);
            string chromeProfile = Path.Combine(work, "Chrome Profile"); Directory.CreateDirectory(chromeProfile);
            Announcement firefox = new Announcement { Browser = "firefox", BrowserPath = firefoxPath, ProfilePath = firefoxProfile };
            Announcement chrome = new Announcement { Browser = "chrome", BrowserPath = chromePath, ProfilePath = chromeProfile };
            DateTime nextCheck = DateTime.MinValue;
            Check(HandleAnnouncement(context, firefox) == 0, "Lifecycle Firefox announcement");
            RefreshSessions(context, ref nextCheck);
            Check(ReadSessions(context.StatePath)[0].Phase == PendingPhase, "No browser means no protocol activation");
            running[firefoxProfile] = DateTime.UtcNow.AddMinutes(-2).ToString("o", CultureInfo.InvariantCulture);
            RefreshSessions(context, ref nextCheck);
            string firefoxId = ReadSessions(context.StatePath)[0].SessionId;
            Check(ReadSession(context.StatePath, firefoxId).Phase == ActivePhase, "First Firefox activates");
            Check(HandleAnnouncement(context, chrome) == 0, "Chrome accepted while Firefox runs");
            RefreshSessions(context, ref nextCheck);
            Check(ReadSession(context.StatePath, firefoxId).Phase == ActivePhase, "Unstarted Chrome does not steal routing");
            running[chromeProfile] = DateTime.UtcNow.AddMinutes(-1).ToString("o", CultureInfo.InvariantCulture);
            RefreshSessions(context, ref nextCheck);
            SessionState chromeState = ReadSessions(context.StatePath).Find(delegate(SessionState state) { return state.Browser == "chrome"; });
            Check(chromeState.Phase == ActivePhase && ReadSession(context.StatePath, firefoxId).Phase == StandbyPhase,
                "Newer Chrome takes over and Firefox enters standby");
            Check(cleaned.Count == 0, "Preemption preserves Firefox maintenance");
            Check(HandleAnnouncement(context, firefox) == 0, "Repeated older Firefox announcement remains idempotent");
            RefreshSessions(context, ref nextCheck);
            Check(ReadSession(context.StatePath, chromeState.SessionId).Phase == ActivePhase, "Repeated announcement does not steal routing");
            queryUnknown = true; running.Remove(chromeProfile);
            RefreshSessions(context, ref nextCheck);
            Check(ReadSession(context.StatePath, chromeState.SessionId).FallbackActive, "Unknown process status does not clean or switch");
            queryUnknown = false; releaseAllowed = false;
            RefreshSessions(context, ref nextCheck);
            Check(!ReadSession(context.StatePath, chromeState.SessionId).FallbackActive &&
                ReadSession(context.StatePath, firefoxId).Phase == StandbyPhase, "Failed release blocks replacement and rejects old delivery");
            releaseAllowed = true;
            RefreshSessions(context, ref nextCheck);
            Check(ReadSession(context.StatePath, chromeState.SessionId) == null && ReadSession(context.StatePath, firefoxId).Phase == ActivePhase,
                "Retry completes Chrome exit and restores Firefox");
            Check(cleaned.Count == 1 && cleaned[0] == "chrome", "Only exited Chrome was cleaned");

            // 模拟重启：每次刷新从磁盘读取状态，新的 Context 必须能恢复并继续选择。
            BridgeContext recovered = new BridgeContext { BridgePath = context.BridgePath, StatePath = context.StatePath,
                StateMutexName = context.StateMutexName, Operations = context.Operations };
            Check(HandleAnnouncement(recovered, chrome) == 0, "Chrome can announce a new session after its old session ends");
            running[chromeProfile] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            RefreshSessions(recovered, ref nextCheck);
            Check(ReadSession(context.StatePath, firefoxId).Phase == StandbyPhase, "Recovered coordinator applies latest-start policy");
            firefoxCleanupFails = true; running.Remove(firefoxProfile);
            RefreshSessions(recovered, ref nextCheck);
            Check(ReadSession(context.StatePath, firefoxId).Phase == CleaningPhase &&
                ReadSessions(context.StatePath).Exists(delegate(SessionState state) { return state.Browser == "chrome" && state.Phase == ActivePhase; }),
                "Firefox cleanup failure preserves its record while Chrome continues");
            firefoxCleanupFails = false;
            RefreshSessions(recovered, ref nextCheck);
            Check(ReadSession(context.StatePath, firefoxId) == null, "Failed Firefox cleanup is retried");
            Check(HandleAnnouncement(recovered, firefox) == 0, "Firefox may restart after completed cleanup");
            running[firefoxProfile] = DateTime.UtcNow.AddSeconds(1).ToString("o", CultureInfo.InvariantCulture);
            RefreshSessions(recovered, ref nextCheck);
            Check(ReadSessions(context.StatePath).Exists(delegate(SessionState state) { return state.Browser == "firefox" && state.Phase == ActivePhase; }),
                "Reverse launch order: newer Firefox preempts Chrome");
            running.Remove(firefoxProfile); RefreshSessions(recovered, ref nextCheck);
            Check(ReadSessions(context.StatePath).Exists(delegate(SessionState state) { return state.Browser == "chrome" && state.Phase == ActivePhase; }),
                "Firefox exit restores Chrome");

            string pendingProfile = Path.Combine(work, "Never Started"); Directory.CreateDirectory(pendingProfile);
            Announcement pending = new Announcement { Browser = "chrome", BrowserPath = chromePath, ProfilePath = pendingProfile };
            Check(HandleAnnouncement(recovered, pending) == 0, "Pending session accepted alongside active Chrome");
            SessionState pendingState = ReadSessions(context.StatePath).Find(delegate(SessionState state) { return state.ProfilePath == pendingProfile; });
            pendingState.ExpiresUtc = DateTime.UtcNow.AddSeconds(-1).ToString("o", CultureInfo.InvariantCulture);
            WriteStateAtomic(context.StatePath, pendingState);
            RefreshSessions(recovered, ref nextCheck);
            Check(ReadSession(context.StatePath, pendingState.SessionId) == null, "Unstarted announcement expires without disturbing active Chrome");
            prepareFails = true;
            Reject(delegate { HandleAnnouncement(recovered, pending); }, "Preparation failure propagates");
            Check(ReadSessions(context.StatePath).Exists(delegate(SessionState state) { return state.ProfilePath == pendingProfile && state.Phase == CleaningPhase; }),
                "Failed preparation retains recoverable cleanup state");
            prepareFails = false; RefreshSessions(recovered, ref nextCheck);
            running[chromeProfile] = DateTime.UtcNow.AddSeconds(2).ToString("o", CultureInfo.InvariantCulture);
            RefreshSessions(recovered, ref nextCheck);
            Check(ReadSessions(context.StatePath).Exists(delegate(SessionState state) { return state.ProfilePath == chromeProfile && state.Phase == CleaningPhase; }),
                "Unannounced replacement process cannot inherit old GUID or have its in-use profile cleaned");
            running.Clear(); RefreshSessions(recovered, ref nextCheck);
            Check(!File.Exists(context.StatePath), "All browsers exited: lifecycle leaves no runtime state");

            string testPipe = "PortableBridge-Test-" + Guid.NewGuid().ToString("N");
            StartControlPipeServer(recovered, testPipe);
            Check(SendTestMessage(testPipe, new[] { "announce-v3", "chrome", chromePath, chromeProfile, "" }) == 0,
                "Actual pipe dispatch accepts Chrome v3");
            Check(SendTestMessage(testPipe, new[] { "announce-v2", firefoxPath, firefoxProfile }) == 0,
                "Actual pipe dispatch preserves Firefox v2");
            Check(ReadSessions(context.StatePath).Count == 2, "Pipe announcements share one session store");
            Check(SendTestMessage(testPipe, new[] { "unknown-operation" }) == 64, "Unknown pipe operation rejected");
        }

        private static int SendTestMessage(string pipeName, string[] fields)
        {
            using (NamedPipeClientStream client = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut))
            {
                client.Connect(5000);
                using (BinaryWriter writer = new BinaryWriter(client, Encoding.UTF8, true))
                using (BinaryReader reader = new BinaryReader(client, Encoding.UTF8, true))
                {
                    foreach (string field in fields) writer.Write(field);
                    writer.Flush();
                    return reader.ReadInt32();
                }
            }
        }
    }
}
