using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace PortableBrowserBridge
{
    [DataContract]
    internal sealed class SessionStore
    {
        [DataMember(Order = 1)] public int SchemaVersion;
        [DataMember(Order = 2)] public SessionState[] Sessions;
    }

    internal static partial class Program
    {
        internal delegate bool BrowserQuery(SessionState state, out bool querySucceeded);

        // 系统副作用集中在此边界，协调器可以用隔离平台验证完整生命周期。
        internal sealed class SessionOperations
        {
            internal BrowserQuery Query = IsAnnouncedBrowserRunning;
            internal Action<Announcement> Prepare = BrowserSupport.Prepare;
            internal Action<SessionState> Cleanup = BrowserSupport.Cleanup;
            internal Func<SessionState, List<SessionState>, ChromeRegistryBaseline> CaptureChrome = ChromeMaintenance.Capture;
            internal Func<List<SessionState>, bool> ObserveChrome = ChromeMaintenance.Observe;
            internal Action<SessionState, List<SessionState>> CleanupChrome = ChromeMaintenance.Cleanup;
            internal Func<SessionState, bool> ReleaseProtocols = CleanupOwnedArtifacts;
            internal Func<string, List<SchemeState>> InspectSchemes = ReadInitialSchemeStatesWhenStable;
            internal Action RemoveStaleChoices = RemoveStaleEdgeUserChoices;
            internal Action<BridgeContext, SessionState> EnsureProtocols = EnsureProtocolFallback;
        }

        private static List<SessionState> ReadSessions(string path)
        {
            if (!File.Exists(path)) return new List<SessionState>();
            using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete))
            {
                SessionStore store = (SessionStore)new DataContractJsonSerializer(typeof(SessionStore)).ReadObject(stream);
                ValidateStore(store);
                return new List<SessionState>(store.Sessions);
            }
        }

        private static void ValidateStore(SessionStore store)
        {
            if (store == null || store.SchemaVersion != CurrentSchemaVersion || store.Sessions == null ||
                store.Sessions.Length > 32)
                throw new InvalidOperationException("Invalid session store. Finish all sessions with the old Bridge before upgrading.");
            HashSet<string> ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Dictionary<string, ChromeRegistryBaseline> chromeRoots = new Dictionary<string, ChromeRegistryBaseline>(StringComparer.OrdinalIgnoreCase);
            Dictionary<string, string> chromeCohorts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            int active = 0;
            foreach (SessionState state in store.Sessions)
            {
                ValidateState(state);
                ChromeMaintenance.Validate(state.ChromeRegistry);
                if (state.Browser != BrowserSupport.Chrome && state.ChromeRegistry != null)
                    throw new InvalidOperationException("Only Chrome sessions may carry Chrome baselines.");
                if (state.ChromeRegistry != null)
                {
                    ChromeRegistryBaseline previous;
                    string previousRoot;
                    if (chromeRoots.TryGetValue(state.ChromeRegistry.Root, out previous) &&
                        !ChromeMaintenance.SameBaseline(previous, state.ChromeRegistry))
                        throw new InvalidOperationException("Conflicting Chrome cohort baselines.");
                    if (chromeCohorts.TryGetValue(state.ChromeRegistry.CohortId, out previousRoot) &&
                        previousRoot != state.ChromeRegistry.Root)
                        throw new InvalidOperationException("A Chrome cohort cannot own different registry roots.");
                    chromeRoots[state.ChromeRegistry.Root] = state.ChromeRegistry;
                    chromeCohorts[state.ChromeRegistry.CohortId] = state.ChromeRegistry.Root;
                }
                if (!ids.Add(state.SessionId)) throw new InvalidOperationException("Duplicate session identity.");
                if (state.Phase == ActivePhase) active++;
            }
            if (active > 1) throw new InvalidOperationException("Multiple sessions own the protocol entry.");
        }

        private static SessionState ReadSession(string path, string sessionId)
        {
            return ReadSessions(path).Find(delegate(SessionState state)
            {
                return string.Equals(state.SessionId, sessionId, StringComparison.OrdinalIgnoreCase);
            });
        }

        // 调用方必须持有用户级状态互斥体；所有浏览器状态一起原子写入。
        private static void WriteStateAtomic(string path, SessionState state)
        {
            List<SessionState> sessions = ReadSessions(path);
            int index = sessions.FindIndex(delegate(SessionState existing) { return existing.SessionId == state.SessionId; });
            if (index < 0) sessions.Add(state); else sessions[index] = state;
            WriteStoreAtomic(path, new SessionStore { SchemaVersion = CurrentSchemaVersion, Sessions = sessions.ToArray() });
        }

        private static void RemoveSession(string path, string sessionId)
        {
            List<SessionState> sessions = ReadSessions(path);
            sessions.RemoveAll(delegate(SessionState state) { return state.SessionId == sessionId; });
            if (sessions.Count == 0) File.Delete(path);
            else WriteStoreAtomic(path, new SessionStore { SchemaVersion = CurrentSchemaVersion, Sessions = sessions.ToArray() });
        }

        private static bool SameAnnouncement(SessionState state, Announcement announcement)
        {
            return state.Browser == announcement.Browser && SamePath(state.BrowserPath, announcement.BrowserPath) &&
                SamePath(state.ProfilePath, announcement.ProfilePath) &&
                string.Equals(state.ProfileDirectory ?? string.Empty, announcement.ProfileDirectory ?? string.Empty,
                    StringComparison.OrdinalIgnoreCase);
        }

        private static int HandleAnnouncement(BridgeContext context, Announcement announcement)
        {
            ValidateAnnouncement(announcement);
            return ExecuteWithStateMutex<int>(context, delegate()
            {
                List<SessionState> sessions = ReadSessions(context.StatePath);
                foreach (SessionState existing in sessions)
                {
                    if (SameAnnouncement(existing, announcement))
                    {
                        if (existing.Phase == CleaningPhase) return 75;
                        if (existing.Phase == PendingPhase) return 0;
                        bool querySucceeded;
                        return context.Operations.Query(existing, out querySucceeded) && querySucceeded ? 0 : 75;
                    }
                    // Firefox 维护还涉及主机 Mozilla 基线；同一用户只接受一个 Firefox 便携会话。
                    // Chrome 的进程单例按 user-data-dir 归属，同一根不能再声明为另一 Profile 会话。
                    if (SamePath(existing.ProfilePath, announcement.ProfilePath) ||
                        (existing.Browser == BrowserSupport.Firefox && announcement.Browser == BrowserSupport.Firefox))
                        return existing.Phase == CleaningPhase ? 75 : 73;
                }
                if (sessions.Count >= 32) return 73;
                string sessionId = Guid.NewGuid().ToString("D");
                SessionState state = new SessionState
                {
                    SchemaVersion = CurrentSchemaVersion, Phase = PendingPhase, SessionId = sessionId,
                    BridgePath = context.BridgePath, HandlerCommand = CreateHandlerCommand(context.BridgePath, sessionId),
                    CreatedUtc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                    ExpiresUtc = DateTime.UtcNow.AddSeconds(AnnouncementLifetimeSeconds).ToString("o", CultureInfo.InvariantCulture),
                    Browser = announcement.Browser, BrowserPath = announcement.BrowserPath,
                    ProfilePath = announcement.ProfilePath, ProfileDirectory = announcement.ProfileDirectory,
                    EnvironmentVariables = BrowserSupport.GetEnvironment(announcement), Schemes = new SchemeState[0]
                };
                // 准备失败也能恢复收尾；重复 pending 上报不会覆盖原来的基线。
                if (state.Browser == BrowserSupport.Chrome)
                    state.ChromeRegistry = context.Operations.CaptureChrome(state, sessions);
                WriteStateAtomic(context.StatePath, state);
                try { context.Operations.Prepare(announcement); }
                catch
                {
                    state.Phase = CleaningPhase;
                    state.ExpiresUtc = null;
                    WriteStateAtomic(context.StatePath, state);
                    throw;
                }
                return 0;
            });
        }

        private static SessionState SelectLatestSession(List<SessionState> running)
        {
            SessionState selected = null;
            foreach (SessionState state in running)
            {
                if (selected == null || CompareSessionStart(state, selected) > 0) selected = state;
            }
            return selected;
        }

        private static void InvalidateRecoveredChromeBaselines(BridgeContext context)
        {
            // We cannot attribute writes while the monitor was not running.
            List<SessionState> sessions = ReadSessions(context.StatePath);
            bool changed = false;
            foreach (SessionState state in sessions)
                if (state.ChromeRegistry != null && !state.ChromeRegistry.Unsafe)
                {
                    state.ChromeRegistry.Unsafe = true;
                    changed = true;
                }
            if (changed)
                WriteStoreAtomic(context.StatePath, new SessionStore { SchemaVersion = CurrentSchemaVersion, Sessions = sessions.ToArray() });
        }

        private static int CompareSessionStart(SessionState first, SessionState second)
        {
            int result = ParseUtc(first.StartedUtc, "browser start time").CompareTo(ParseUtc(second.StartedUtc, "browser start time"));
            if (result == 0) result = string.CompareOrdinal(first.CreatedUtc, second.CreatedUtc);
            if (result == 0) result = string.CompareOrdinal(first.SessionId, second.SessionId);
            return result;
        }

        private static void RefreshSessions(BridgeContext context, ref DateTime nextRegistrationCheck)
        {
            List<SessionState> observed = ReadSessions(context.StatePath);
            if (context.Operations.ObserveChrome(observed))
                WriteStoreAtomic(context.StatePath, new SessionStore { SchemaVersion = CurrentSchemaVersion, Sessions = observed.ToArray() });
            List<SessionState> running = new List<SessionState>();
            bool uncertain = false;
            foreach (SessionState state in ReadSessions(context.StatePath))
            {
                if (!SamePath(state.BridgePath, context.BridgePath))
                    throw new InvalidOperationException("A session belongs to another Bridge path. Finish it before moving the executable.");
                if (state.Phase == CleaningPhase) { EndSession(context, state.SessionId); continue; }
                bool querySucceeded;
                string previousStart = state.StartedUtc;
                bool browserRunning = context.Operations.Query(state, out querySucceeded);
                if (!querySucceeded) { uncertain = true; continue; }
                if (browserRunning)
                {
                    if (previousStart != state.StartedUtc) WriteStateAtomic(context.StatePath, state);
                    running.Add(state);
                }
                else if (previousStart != null || DateTime.UtcNow >= ParseUtc(state.ExpiresUtc, "announcement expiration"))
                {
                    EndSession(context, state.SessionId);
                }
            }
            // WMI 失败不能被解释为退出，也不能导致错误地切换到另一个浏览器。
            if (uncertain) return;
            SessionState selected = SelectLatestSession(running);
            SessionState active = ReadSessions(context.StatePath).Find(delegate(SessionState state) { return state.Phase == ActivePhase; });
            if (active != null && (!active.FallbackActive || selected == null || selected.SessionId != active.SessionId))
            {
                if (!SuspendSession(context, active)) return;
                active = null;
            }
            if (selected == null) return;
            if (active == null)
            {
                TryActivateSession(context, selected.SessionId);
                nextRegistrationCheck = DateTime.UtcNow.AddSeconds(2);
            }
            else if (DateTime.UtcNow >= nextRegistrationCheck)
            {
                TryEnsureActiveSession(context, active.SessionId);
                nextRegistrationCheck = DateTime.UtcNow.AddSeconds(2);
            }
        }

        private static bool SuspendSession(BridgeContext context, SessionState state)
        {
            state.FallbackActive = false;
            state.ProtocolFallbackActive = false;
            WriteStateAtomic(context.StatePath, state);
            if (!context.Operations.ReleaseProtocols(state))
            {
                WriteError(context, new InvalidOperationException("Cannot safely release the previous session's protocol ownership."));
                return false;
            }
            state.MachineFallbackCreated = false;
            state.Phase = StandbyPhase;
            WriteStateAtomic(context.StatePath, state);
            return true;
        }

        private static void EndSession(BridgeContext context, string sessionId)
        {
            SessionState state = ReadSession(context.StatePath, sessionId);
            if (state == null) return;
            if (state.Phase == ActivePhase && !SuspendSession(context, state)) return;
            state.Phase = CleaningPhase;
            state.ExpiresUtc = null;
            WriteStateAtomic(context.StatePath, state);
            bool querySucceeded;
            // 旧主进程结束后，同路径的新进程不继承旧 GUID，但也不能清理它正在使用的配置。
            SessionState cleanupProbe = new SessionState
            {
                Browser = state.Browser, BrowserPath = state.BrowserPath,
                ProfilePath = state.ProfilePath, ProfileDirectory = state.ProfileDirectory
            };
            if (context.Operations.Query(cleanupProbe, out querySucceeded) || !querySucceeded) return;
            try
            {
                if (state.Browser == BrowserSupport.Chrome)
                    context.Operations.CleanupChrome(state, ReadSessions(context.StatePath));
                context.Operations.Cleanup(state);
                RemoveSession(context.StatePath, sessionId);
                DeleteErrorLog(context);
            }
            catch (Exception exception) { WriteError(context, exception); }
        }
    }
}
