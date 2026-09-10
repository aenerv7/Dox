using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Management;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("Portable Browser Bridge")]
[assembly: System.Reflection.AssemblyDescription("Persistent HTTP(S) fallback monitor for announced portable Firefox and Chrome sessions")]
[assembly: System.Reflection.AssemblyCompany("Dox")]
[assembly: System.Reflection.AssemblyProduct("Portable Browser Bridge")]
[assembly: System.Reflection.AssemblyVersion("3.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("3.0.0.0")]

namespace PortableBrowserBridge
{
    [DataContract]
    internal sealed class SessionState
    {
        [DataMember(Order = 1)] public int SchemaVersion;
        [DataMember(Order = 2)] public string Phase;
        [DataMember(Order = 3)] public string SessionId;
        [DataMember(Order = 4)] public string BridgePath;
        [DataMember(Order = 5)] public string HandlerCommand;
        [DataMember(Order = 7)] public string CreatedUtc;
        [DataMember(Order = 8, EmitDefaultValue = false)] public string ExpiresUtc;
        [DataMember(Order = 9)] public string BrowserPath;
        [DataMember(Order = 10)] public string ProfilePath;
        [DataMember(Order = 11)] public EnvironmentVariableState[] EnvironmentVariables;
        [DataMember(Order = 12)] public SchemeState[] Schemes;
        [DataMember(Order = 14, EmitDefaultValue = false)] public bool FallbackActive;
        [DataMember(Order = 15, EmitDefaultValue = false)] public bool MachineFallbackCreated;
        [DataMember(Order = 16, EmitDefaultValue = false)] public bool ProtocolFallbackActive;
        [DataMember(Order = 17)] public string Browser;
        [DataMember(Order = 18, EmitDefaultValue = false)] public string ProfileDirectory;
        [DataMember(Order = 19, EmitDefaultValue = false)] public string StartedUtc;
    }

    [DataContract]
    internal sealed class SchemeState
    {
        [DataMember(Order = 1)] public string Scheme;
        [DataMember(Order = 2)] public bool RootExisted;
    }

    [DataContract]
    internal sealed class EnvironmentVariableState
    {
        [DataMember(Order = 1)] public string Name;
        [DataMember(Order = 2)] public string Value;
    }

    internal sealed class Announcement
    {
        internal string Browser;
        internal string ProfileDirectory;
        internal string BrowserPath;
        internal string ProfilePath;
    }

    internal sealed class BridgeContext
    {
        internal Program.SessionOperations Operations = new Program.SessionOperations();
        internal string BridgePath;
        internal string DataPath;
        internal string StatePath;
        internal string ErrorPath;
        internal string OpenTracePath;
        internal string PipeName;
        internal string MonitorMutexName;
        internal string StateMutexName;
    }

    internal sealed class UserChoiceConflictException : InvalidOperationException
    {
        internal UserChoiceConflictException(string message)
            : base(message)
        {
        }

        internal UserChoiceConflictException(string message, Exception innerException)
            : base(message, innerException)
        {
        }
    }

    internal static partial class Program
    {
        private const int CurrentSchemaVersion = 2;
        private const string PendingPhase = "pending";
        private const string StandbyPhase = "standby";
        private const string ActivePhase = "active";
        private const string CleaningPhase = "cleaning";
        private const string OwnerValueName = "FirefoxPortableSessionId";
        private const string LegacyGhBrowserValueName = "GH_BROWSER";
        private const int AssociationChanged = unchecked((int)0x08000000);
        private const uint AssociationChangedNotifyFlags = 0x00001003; // SHCNF_DWORD | SHCNF_FLUSH
        private const uint AssociationQueryFlags = 0x00001040; // ASSOCF_IS_PROTOCOL | ASSOCF_VERIFY
        private const uint ClassAssociationQueryFlags = 0;
        private const uint AssociationStringCommand = 1; // ASSOCSTR_COMMAND
        private const uint ErrorNoAssociationHResult = 0x80070483;
        private const uint WmSettingChange = 0x001A;
        private const uint SmtoAbortIfHung = 0x0002;
        private const int InitialSchemeStabilizationMilliseconds = 5000;
        private const int InitialSchemePollMilliseconds = 100;
        private const int AnnouncementLifetimeSeconds = 90;
        private static readonly string[] Schemes = { "http", "https" };
        private static readonly string[] PortableEnvironmentNames =
        {
            "TEMP",
            "TMP",
            "MOZ_APP_DATA",
            "MOZ_LOCAL_APP_DATA",
            "MOZ_CRASHREPORTER_DISABLE",
            "MOZ_CRASHREPORTER_DATA_DIRECTORY",
            "MOZ_CRASHREPORTER_EVENTS_DIRECTORY",
            "MOZ_CRASHREPORTER_PING_DIRECTORY",
            "CRASHES_EVENTS_DIR"
        };

        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);

        [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
        private static extern uint AssocQueryString(
            uint flags,
            uint associationString,
            string association,
            string extra,
            StringBuilder output,
            ref uint outputLength);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CommandLineToArgvW(string commandLine, out int argumentCount);

        [DllImport("kernel32.dll")]
        private static extern IntPtr LocalFree(IntPtr memory);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr SendMessageTimeout(
            IntPtr window,
            uint message,
            UIntPtr wParam,
            string lParam,
            uint flags,
            uint timeout,
            out UIntPtr result);

        [STAThread]
        private static int Main(string[] args)
        {
            BridgeContext context = null;
            try
            {
                context = CreateContext();
                if (args.Length == 0)
                {
                    return StartMonitor(context);
                }

                if (args.Length == 3 && string.Equals(args[0], "open", StringComparison.OrdinalIgnoreCase))
                {
                    return OpenUrl(context, args[1], args[2]);
                }

                return 64;
            }
            catch (Exception exception)
            {
                if (context != null)
                {
                    WriteError(context, exception);
                }

                return 1;
            }
        }

        private static int StartMonitor(BridgeContext context)
        {
            if (IsCurrentProcessAdministrator())
            {
                return Monitor(context);
            }

            if (IsMonitorAlreadyRunning(context))
            {
                return 0;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = context.BridgePath,
                WorkingDirectory = context.DataPath,
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using (Process elevatedProcess = Process.Start(startInfo))
            {
                if (elevatedProcess == null)
                {
                    throw new InvalidOperationException("Windows did not start the elevated Bridge monitor.");
                }
            }

            return 0;
        }

        private static bool IsCurrentProcessAdministrator()
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                WindowsPrincipal principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        private static bool IsMonitorAlreadyRunning(BridgeContext context)
        {
            try
            {
                using (Mutex existing = Mutex.OpenExisting(context.MonitorMutexName))
                {
                    return true;
                }
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                return false;
            }
            catch (UnauthorizedAccessException)
            {
                return true;
            }
        }

        private static BridgeContext CreateContext()
        {
            string bridgePath = NormalizePath(Process.GetCurrentProcess().MainModule.FileName);
            string dataPath = Path.GetDirectoryName(bridgePath);
            string identity = ComputeIdentity(GetCurrentUserIdentity());
            return new BridgeContext
            {
                BridgePath = bridgePath,
                DataPath = dataPath,
                StatePath = Path.Combine(dataPath, "runtime-session.json"),
                ErrorPath = Path.Combine(dataPath, "runtime-error.log"),
                OpenTracePath = Path.Combine(dataPath, "runtime-open.log"),
                PipeName = "PortableBridge-Control-" + identity,
                MonitorMutexName = "Local\\FirefoxPortableBridge-Monitor-" + identity,
                StateMutexName = "Local\\FirefoxPortableBridge-State-" + identity
            };
        }

        private static string GetCurrentUserIdentity()
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (identity.User == null)
                {
                    throw new InvalidOperationException("The current Windows user SID is unavailable.");
                }

                return identity.User.Value;
            }
        }

        private static void ValidateAnnouncement(Announcement announcement)
        {
            BrowserSupport.Validate(announcement);
        }

        private static int Monitor(BridgeContext context)
        {
            bool createdNew;
            using (Mutex monitorMutex = new Mutex(true, context.MonitorMutexName, out createdNew))
            {
                if (!createdNew) return 0;
                ExecuteWithStateMutex<object>(context, delegate()
                {
                    CleanupLegacyGhBrowserOverride(context);
                    return null;
                });
                DeleteErrorLog(context);
                StartControlPipeServer(context, context.PipeName);
                // 保留旧启动器端点和旧实例互斥体，避免两个版本同时接管系统协议。
                StartControlPipeServer(context, "FirefoxPortableBridge-Control-" + ComputeIdentity(GetCurrentUserIdentity()));
                DateTime nextRegistrationCheck = DateTime.MinValue;
                DateTime nextOrphanCheck = DateTime.MinValue;
                while (true)
                {
                    try
                    {
                        ExecuteWithStateMutex<object>(context, delegate()
                        {
                            RefreshSessions(context, ref nextRegistrationCheck);
                            if (DateTime.UtcNow >= nextOrphanCheck)
                            {
                                List<SessionState> sessions = ReadSessions(context.StatePath);
                                if (sessions.Count == 0 && !CleanupOrphanedRegistration(context))
                                    throw new InvalidOperationException("Orphaned Bridge protocols could not be cleaned safely.");
                                if (!sessions.Exists(delegate(SessionState entry) { return entry.Browser == BrowserSupport.Firefox; }) &&
                                    !PortableMaintenance.CleanupOrphanedLauncherOverrides())
                                    throw new InvalidOperationException("Orphaned Firefox Launcher artifacts could not be cleaned safely.");
                                nextOrphanCheck = DateTime.UtcNow.AddSeconds(5);
                            }
                            return null;
                        });
                    }
                    catch (Exception exception) { WriteError(context, exception); }
                    Thread.Sleep(500);
                }
            }
        }

        private static void StartControlPipeServer(BridgeContext context, string pipeName)
        {
            Thread serverThread = new Thread(delegate()
            {
                while (true)
                {
                    try
                    {
                        using (NamedPipeServerStream server = CreatePipeServer(pipeName))
                        {
                            server.WaitForConnection();
                            using (BinaryReader reader = new BinaryReader(server, Encoding.UTF8, true))
                            using (BinaryWriter writer = new BinaryWriter(server, Encoding.UTF8, true))
                            {
                                string operation = reader.ReadString();
                                int result;
                                if (string.Equals(operation, "announce-v2", StringComparison.Ordinal))
                                {
                                    result = HandleAnnouncement(context, ReadAnnouncement(reader, false));
                                }
                                else if (string.Equals(operation, "announce-v3", StringComparison.Ordinal))
                                {
                                    result = HandleAnnouncement(context, ReadAnnouncement(reader, true));
                                }
                                else if (string.Equals(operation, "open", StringComparison.Ordinal))
                                {
                                    result = DeliverUrl(context, reader.ReadString(), reader.ReadString());
                                }
                                else
                                {
                                    result = 64;
                                }

                                writer.Write(result);
                                writer.Flush();
                            }
                        }
                    }
                    catch (Exception exception)
                    {
                        WriteError(context, exception);
                        Thread.Sleep(250);
                    }
                }
            });
            serverThread.IsBackground = true;
            serverThread.Name = pipeName;
            serverThread.Start();
        }

        private static NamedPipeServerStream CreatePipeServer(string pipeName)
        {
            SecurityIdentifier user;
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                user = identity.User;
            }

            if (user == null)
            {
                throw new InvalidOperationException("The current Windows user SID is unavailable.");
            }

            PipeSecurity security = new PipeSecurity();
            security.SetOwner(user);
            security.AddAccessRule(new PipeAccessRule(user, PipeAccessRights.FullControl, AccessControlType.Allow));
            return new NamedPipeServerStream(
                pipeName, PipeDirection.InOut, 4, PipeTransmissionMode.Byte, PipeOptions.None, 0, 0, security);
        }

        private static Announcement ReadAnnouncement(BinaryReader reader, bool version3)
        {
            Announcement announcement = new Announcement
            {
                Browser = version3 ? reader.ReadString() : BrowserSupport.Firefox,
                BrowserPath = reader.ReadString(),
                ProfilePath = reader.ReadString(),
                ProfileDirectory = version3 ? reader.ReadString() : null
            };
            ValidateAnnouncement(announcement);
            return announcement;
        }

        private static void TryActivateSession(BridgeContext context, string sessionId)
        {
            try
            {
                ExecuteWithStateMutex<object>(context, delegate()
                {
                    SessionState state = ReadSession(context.StatePath, sessionId);
                    if (state == null || !string.Equals(state.SessionId, sessionId, StringComparison.Ordinal) ||
                        !string.Equals(state.Phase, PendingPhase, StringComparison.Ordinal) &&
                        !string.Equals(state.Phase, StandbyPhase, StringComparison.Ordinal))
                    {
                        return null;
                    }

                    context.Operations.RemoveStaleChoices();
                    state.Schemes = context.Operations.InspectSchemes(state.HandlerCommand).ToArray();
                    state.Phase = ActivePhase;
                    state.ExpiresUtc = null;
                    state.FallbackActive = true;
                    state.MachineFallbackCreated = false;
                    state.ProtocolFallbackActive = false;
                    WriteStateAtomic(context.StatePath, state);
                    try
                    {
                        context.Operations.EnsureProtocols(context, state);
                        DeleteErrorLog(context);
                    }
                    catch
                    {
                        state.ProtocolFallbackActive = false;
                        WriteStateAtomic(context.StatePath, state);
                        context.Operations.ReleaseProtocols(state);
                        throw;
                    }

                    return null;
                });
            }
            catch (Exception exception)
            {
                WriteError(context, exception);
                Thread.Sleep(2000);
            }
        }

        private static void TryEnsureActiveSession(BridgeContext context, string sessionId)
        {
            try
            {
                ExecuteWithStateMutex<object>(context, delegate()
                {
                    SessionState state = ReadSession(context.StatePath, sessionId);
                    if (state == null || !string.Equals(state.SessionId, sessionId, StringComparison.Ordinal) ||
                        !string.Equals(state.Phase, ActivePhase, StringComparison.Ordinal))
                    {
                        return null;
                    }

                    try
                    {
                        context.Operations.EnsureProtocols(context, state);
                        DeleteErrorLog(context);
                    }
                    catch
                    {
                        state.ProtocolFallbackActive = false;
                        WriteStateAtomic(context.StatePath, state);
                        context.Operations.ReleaseProtocols(state);
                        throw;
                    }

                    return null;
                });
            }
            catch (Exception exception)
            {
                WriteError(context, exception);
            }
        }

        private static int OpenUrl(BridgeContext context, string sessionId, string rawUrl)
        {
            Guid parsedSessionId;
            Uri url;
            if (!Guid.TryParseExact(sessionId, "D", out parsedSessionId) || !TryValidateUrl(rawUrl, out url))
            {
                return 65;
            }

            Exception pipeException = null;
            try
            {
                using (NamedPipeClientStream client = new NamedPipeClientStream(
                    ".", context.PipeName, PipeDirection.InOut, PipeOptions.None))
                {
                    client.Connect(3000);
                    using (BinaryWriter writer = new BinaryWriter(client, Encoding.UTF8, true))
                    using (BinaryReader reader = new BinaryReader(client, Encoding.UTF8, true))
                    {
                        writer.Write("open");
                        writer.Write(sessionId);
                        writer.Write(rawUrl);
                        writer.Flush();
                        int result = reader.ReadInt32();
                        WriteOpenTrace(context, url, "pipe", result, null);
                        return result;
                    }
                }
            }
            catch (Exception exception)
            {
                pipeException = exception;
            }

            int directResult = DeliverUrl(context, sessionId, rawUrl);
            WriteOpenTrace(context, url, "direct-fallback", directResult, pipeException);
            if (directResult != 0)
            {
                WriteError(context, new InvalidOperationException(
                    "The URL could not be delivered through the monitor or direct fallback.", pipeException));
            }

            return directResult;
        }

        private static int DeliverUrl(BridgeContext context, string sessionId, string rawUrl)
        {
            return ExecuteWithStateMutex<int>(context, delegate() { return DeliverUrlCore(context, sessionId, rawUrl); });
        }

        private static int DeliverUrlCore(BridgeContext context, string sessionId, string rawUrl)
        {
            Uri url;
            if (!TryValidateUrl(rawUrl, out url))
            {
                return 65;
            }

            SessionState state = ReadSession(context.StatePath, sessionId);
            if (state == null || !string.Equals(state.Phase, ActivePhase, StringComparison.Ordinal) ||
                !state.FallbackActive || !string.Equals(state.SessionId, sessionId, StringComparison.OrdinalIgnoreCase) ||
                !SamePath(state.BridgePath, context.BridgePath) ||
                !string.Equals(state.HandlerCommand,
                    CreateHandlerCommand(context.BridgePath, state.SessionId), StringComparison.Ordinal))
            {
                return 66;
            }

            bool querySucceeded;
            if (!context.Operations.Query(state, out querySucceeded) || !querySucceeded)
            {
                return 69;
            }

            Directory.CreateDirectory(state.ProfilePath);
            Dictionary<string, string> environment = ToEnvironmentDictionary(state.EnvironmentVariables);
            foreach (KeyValuePair<string, string> variable in environment)
            {
                if (!string.Equals(variable.Key, "MOZ_CRASHREPORTER_DISABLE", StringComparison.OrdinalIgnoreCase))
                {
                    Directory.CreateDirectory(variable.Value);
                }
            }

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = state.BrowserPath,
                Arguments = BrowserSupport.CreateArguments(state, url.AbsoluteUri),
                WorkingDirectory = Path.GetDirectoryName(state.BrowserPath),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            foreach (KeyValuePair<string, string> variable in environment)
            {
                startInfo.EnvironmentVariables[variable.Key] = variable.Value;
            }

            using (Process process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    return 70;
                }

                if (!process.WaitForExit(15000))
                {
                    return 0;
                }

                return process.ExitCode;
            }
        }

        private static bool TryValidateUrl(string rawUrl, out Uri url)
        {
            url = null;
            if (string.IsNullOrWhiteSpace(rawUrl) || rawUrl.Length > 32768)
            {
                return false;
            }

            for (int index = 0; index < rawUrl.Length; index++)
            {
                if (char.IsControl(rawUrl[index]))
                {
                    return false;
                }
            }

            Uri candidate;
            if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out candidate) ||
                (!string.Equals(candidate.Scheme, "http", StringComparison.OrdinalIgnoreCase) &&
                 !string.Equals(candidate.Scheme, "https", StringComparison.OrdinalIgnoreCase)))
            {
                return false;
            }

            url = candidate;
            return true;
        }

        private static bool IsAnnouncedBrowserRunning(SessionState state, out bool querySucceeded)
        {
            querySucceeded = false;
            try
            {
                DateTime? earliestStart = null;
                bool inaccessible = false;
                using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                    "SELECT ExecutablePath, CommandLine, CreationDate FROM Win32_Process WHERE Name = '" +
                    BrowserSupport.ExecutableName(state.Browser) + "'"))
                using (ManagementObjectCollection results = searcher.Get())
                {
                    foreach (ManagementObject process in results)
                    {
                        using (process)
                        {
                            string executablePath = Convert.ToString(process["ExecutablePath"], CultureInfo.InvariantCulture);
                            if (string.IsNullOrWhiteSpace(executablePath)) { inaccessible = true; continue; }
                            if (!SamePath(executablePath, state.BrowserPath)) continue;
                            string commandLine = Convert.ToString(process["CommandLine"], CultureInfo.InvariantCulture);
                            if (string.IsNullOrWhiteSpace(commandLine)) { inaccessible = true; continue; }
                            if (!BrowserSupport.MatchesCommandLine(commandLine, state)) continue;
                            string creation = Convert.ToString(process["CreationDate"], CultureInfo.InvariantCulture);
                            if (string.IsNullOrWhiteSpace(creation)) { inaccessible = true; continue; }
                            DateTime started = ManagementDateTimeConverter.ToDateTime(creation).ToUniversalTime();
                            if (state.StartedUtc != null && started != ParseUtc(state.StartedUtc, "browser start time")) continue;
                            // 同一路径的 Chrome URL 转交进程不能刷新主会话启动时间。
                            if (!earliestStart.HasValue || started < earliestStart.Value) earliestStart = started;
                        }
                    }
                }
                if (earliestStart.HasValue)
                {
                    state.StartedUtc = earliestStart.Value.ToString("o", CultureInfo.InvariantCulture);
                    querySucceeded = true;
                    return true;
                }
                querySucceeded = !inaccessible;
                return false;
            }
            catch { return false; }
        }

        internal static string[] ParseCommandLine(string commandLine)
        {
            if (string.IsNullOrWhiteSpace(commandLine))
            {
                return new string[0];
            }

            int argumentCount;
            IntPtr arguments = CommandLineToArgvW(commandLine, out argumentCount);
            if (arguments == IntPtr.Zero)
            {
                throw new InvalidOperationException("Windows could not parse the browser command line.");
            }

            try
            {
                string[] result = new string[argumentCount];
                for (int index = 0; index < argumentCount; index++)
                {
                    result[index] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments, index * IntPtr.Size));
                }

                return result;
            }
            finally
            {
                LocalFree(arguments);
            }
        }

        private static List<SchemeState> ReadInitialSchemeStatesWhenStable(string expectedHandlerCommand)
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            Exception lastException = null;
            while (true)
            {
                try
                {
                    AssertNoUserChoice(expectedHandlerCommand);
                    List<SchemeState> states = new List<SchemeState>();
                    foreach (string scheme in Schemes)
                    {
                        states.Add(ReadInitialSchemeState(scheme));
                    }

                    AssertNoUserChoice(expectedHandlerCommand);
                    return states;
                }
                catch (InvalidOperationException exception)
                {
                    lastException = exception;
                    if (stopwatch.ElapsedMilliseconds >= InitialSchemeStabilizationMilliseconds)
                    {
                        break;
                    }

                    Thread.Sleep(InitialSchemePollMilliseconds);
                }
            }

            if (lastException is UserChoiceConflictException)
            {
                throw new UserChoiceConflictException(
                    "The per-user HTTP(S) UserChoice state did not become safe for session fallback within " +
                    InitialSchemeStabilizationMilliseconds.ToString(CultureInfo.InvariantCulture) + " ms.",
                    lastException);
            }

            throw new InvalidOperationException(
                "The per-user HTTP(S) protocol keys did not become safe for session fallback within " +
                InitialSchemeStabilizationMilliseconds.ToString(CultureInfo.InvariantCulture) + " ms.",
                lastException);
        }

        private static void WaitForNoUserChoice(string expectedHandlerCommand)
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            UserChoiceConflictException lastException = null;
            while (true)
            {
                try
                {
                    AssertNoUserChoice(expectedHandlerCommand);
                    return;
                }
                catch (UserChoiceConflictException exception)
                {
                    lastException = exception;
                    if (stopwatch.ElapsedMilliseconds >= InitialSchemeStabilizationMilliseconds)
                    {
                        break;
                    }

                    Thread.Sleep(InitialSchemePollMilliseconds);
                }
            }

            throw new UserChoiceConflictException(
                "The per-user HTTP(S) UserChoice state did not become safe for session fallback within " +
                InitialSchemeStabilizationMilliseconds.ToString(CultureInfo.InvariantCulture) + " ms.",
                lastException);
        }

        private static void AssertNoUserChoice(string expectedHandlerCommand)
        {
            foreach (string scheme in Schemes)
            {
                foreach (string choiceName in new[] { "UserChoice", "UserChoiceLatest" })
                {
                    string progId = ReadUserChoiceProgId(scheme, choiceName);
                    if (!string.IsNullOrWhiteSpace(progId) &&
                        HasUsableExternalAssociation(scheme, expectedHandlerCommand))
                    {
                        throw new UserChoiceConflictException(
                            "A per-user " + scheme + " " + choiceName +
                            " selects a handler; the session fallback will not override it.");
                    }
                }
            }
        }

        private static void RemoveStaleEdgeUserChoices()
        {
            bool changed = false;
            foreach (string scheme in Schemes)
            {
                foreach (string choiceName in new[] { "UserChoice", "UserChoiceLatest" })
                {
                    string path = SchemeUserChoicePath(scheme, choiceName);
                    using (RegistryKey key = OpenUserKey(path, true))
                    {
                        if (key == null)
                        {
                            continue;
                        }

                        string directProgId = ReadProgIdValue(key);
                        if (!string.IsNullOrWhiteSpace(directProgId))
                        {
                            // Windows protects UserChoice with its hash.  In particular,
                            // an uninstalled Edge ProgId can be regenerated from the
                            // still-valid hash after a failed write (UCPD/AppDefaults),
                            // so deleting it would only produce an association-change
                            // notification loop and make Explorer redraw repeatedly.
                            if (!HasUserChoiceHash(key) && IsStaleEdgeProgId(directProgId))
                            {
                                key.DeleteValue("ProgId", false);
                                changed = true;
                            }

                            continue;
                        }
                        else
                        {
                            using (RegistryKey nestedProgId = key.OpenSubKey("ProgId", true))
                            {
                                if (!HasUserChoiceHash(key) && nestedProgId != null &&
                                    IsStaleEdgeProgId(ReadProgIdValue(nestedProgId)))
                                {
                                    nestedProgId.DeleteValue("ProgId", false);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }

            if (changed)
            {
                NotifyAssociationChanged();
            }
        }

        private static bool HasUserChoiceHash(RegistryKey key)
        {
            if (key == null)
            {
                return false;
            }

            foreach (string name in key.GetValueNames())
            {
                if (!string.Equals(name, "Hash", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                object value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                return !string.IsNullOrWhiteSpace(Convert.ToString(value, CultureInfo.InvariantCulture));
            }

            return false;
        }

        private static string ReadUserChoiceProgId(string scheme, string choiceName)
        {
            using (RegistryKey key = OpenUserKey(SchemeUserChoicePath(scheme, choiceName), false))
            {
                if (key == null)
                {
                    return null;
                }

                string progId = ReadProgIdValue(key);
                if (!string.IsNullOrWhiteSpace(progId))
                {
                    return progId;
                }

                using (RegistryKey nestedProgId = key.OpenSubKey("ProgId"))
                {
                    return nestedProgId == null ? null : ReadProgIdValue(nestedProgId);
                }
            }
        }

        private static string ReadProgIdValue(RegistryKey key)
        {
            return Convert.ToString(
                key.GetValue("ProgId", null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                CultureInfo.InvariantCulture);
        }

        private static bool IsStaleEdgeProgId(string progId)
        {
            if (string.IsNullOrWhiteSpace(progId) ||
                !progId.StartsWith("MSEdge", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            string command = QueryAssociationCommand(progId, ClassAssociationQueryFlags);
            return string.IsNullOrWhiteSpace(command);
        }

        private static string SchemeUserChoicePath(string scheme, string choiceName)
        {
            return "Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\" +
                scheme + "\\" + choiceName;
        }

        private static bool HasUsableExternalAssociation(string scheme, string expectedHandlerCommand)
        {
            string effectiveCommand = QueryAssociationCommand(scheme, AssociationQueryFlags);
            return !string.IsNullOrWhiteSpace(effectiveCommand) &&
                !string.Equals(effectiveCommand, expectedHandlerCommand, StringComparison.OrdinalIgnoreCase);
        }

        private static string QueryAssociationCommand(string association, uint flags)
        {
            uint outputLength = 32768;
            StringBuilder output = new StringBuilder((int)outputLength);
            uint result = AssocQueryString(
                flags, AssociationStringCommand, association, "open", output, ref outputLength);
            if (result == ErrorNoAssociationHResult)
            {
                return null;
            }

            if (result != 0)
            {
                throw new InvalidOperationException(
                    "Windows could not verify the effective " + association +
                    " handler while resolving the URL association (HRESULT 0x" +
                    result.ToString("X8", CultureInfo.InvariantCulture) + ").");
            }

            string command = output.ToString();
            if (string.IsNullOrWhiteSpace(command))
            {
                throw new InvalidOperationException(
                    "Windows reported an empty effective " + association + " handler command.");
            }

            return command;
        }

        private static SchemeState ReadInitialSchemeState(string scheme)
        {
            string path = SchemePath(scheme);
            using (RegistryKey key = OpenSchemeKey(path, false))
            {
                if (key == null)
                {
                    return new SchemeState { Scheme = scheme, RootExisted = false };
                }

                string[] valueNames = key.GetValueNames();
                string[] subKeyNames = key.GetSubKeyNames();
                if (valueNames.Length != 1 || subKeyNames.Length != 0 ||
                    !string.Equals(valueNames[0], "URL Protocol", StringComparison.OrdinalIgnoreCase) ||
                    key.GetValueKind(valueNames[0]) != RegistryValueKind.String ||
                    !string.IsNullOrEmpty(Convert.ToString(key.GetValue(
                        valueNames[0], null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture)))
                {
                    throw new InvalidOperationException(
                        "The per-user " + scheme + " protocol key is not an empty URL Protocol marker: HKCU\\" + path);
                }

                return new SchemeState { Scheme = scheme, RootExisted = true };
            }
        }

        private static void EnsureProtocolFallback(BridgeContext context, SessionState state)
        {
            if (state.ProtocolFallbackActive)
            {
                VerifyEffectiveProtocolRegistration(state);
            }

            RemoveStaleEdgeUserChoices();
            WaitForNoUserChoice(state.HandlerCommand);

            if (!state.MachineFallbackCreated)
            {
                if (!CleanupLegacyUserProtocolArtifacts(state))
                {
                    throw new InvalidOperationException(
                        "The legacy per-user URL handler could not be cleaned safely before migration.");
                }

                AssertMachineSchemeRootsAbsent();
                state.MachineFallbackCreated = true;
                state.ProtocolFallbackActive = false;
                WriteStateAtomic(context.StatePath, state);
            }

            if (!IsMachineRegistrationActive(state))
            {
                foreach (string scheme in Schemes)
                {
                    AssertCanRestoreMachineScheme(scheme, state.SessionId, state.HandlerCommand);
                }

                state.ProtocolFallbackActive = false;
                WriteStateAtomic(context.StatePath, state);
                RestoreMachineRegistration(state);
            }

            if (!state.ProtocolFallbackActive)
            {
                state.ProtocolFallbackActive = true;
                WriteStateAtomic(context.StatePath, state);
            }
        }

        private static void AssertMachineSchemeRootsAbsent()
        {
            foreach (string scheme in Schemes)
            {
                using (RegistryKey root = OpenMachineSchemeKey(scheme, false))
                {
                    if (root != null)
                    {
                        throw new InvalidOperationException(
                            "The machine-level " + scheme + " protocol key already exists; refusing to overwrite it.");
                    }
                }
            }
        }

        private static void RestoreMachineRegistration(SessionState state)
        {
            AssertNoUserChoice(state.HandlerCommand);
            foreach (string scheme in Schemes)
            {
                AssertCanRestoreMachineScheme(scheme, state.SessionId, state.HandlerCommand);
            }

            foreach (string scheme in Schemes)
            {
                using (RegistryKey root = CreateMachineSchemeKey(scheme))
                {
                    if (root == null)
                    {
                        throw new InvalidOperationException(
                            "Could not create HKLM\\Software\\Classes\\" + scheme + ".");
                    }

                    root.SetValue(OwnerValueName, state.SessionId, RegistryValueKind.String);
                    root.SetValue("URL Protocol", string.Empty, RegistryValueKind.String);
                }

                using (RegistryKey command = CreateMachineSchemeKey(scheme + "\\shell\\open\\command"))
                {
                    if (command == null)
                    {
                        throw new InvalidOperationException(
                            "Could not create the temporary machine-level " + scheme + " command.");
                    }

                    command.SetValue(string.Empty, state.HandlerCommand, RegistryValueKind.String);
                }
            }

            NotifyAssociationChanged();
            VerifyEffectiveProtocolRegistration(state);
        }

        private static bool IsMachineRegistrationActive(SessionState state)
        {
            if (!state.MachineFallbackCreated)
            {
                return false;
            }

            foreach (string scheme in Schemes)
            {
                using (RegistryKey root = OpenMachineSchemeKey(scheme, false))
                {
                    if (root == null || !HasMatchingOwner(root, state.SessionId) ||
                        !IsEmptyProtocolMarker(root) || !HasOnlyOwnedRootValues(root) ||
                        !IsOwnedTreeShapeSafe(root, state.HandlerCommand, true))
                    {
                        return false;
                    }
                }
            }

            VerifyEffectiveProtocolRegistration(state);
            return true;
        }

        private static void VerifyEffectiveProtocolRegistration(SessionState state)
        {
            foreach (string scheme in Schemes)
            {
                string effectiveCommand = QueryAssociationCommand(scheme, AssociationQueryFlags);
                if (!string.Equals(effectiveCommand, state.HandlerCommand, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException(
                        "Windows did not resolve the effective " + scheme +
                        " handler to the active Portable Browser Bridge session.");
                }
            }
        }

        private static void AssertCanRestoreMachineScheme(
            string scheme, string sessionId, string expectedCommand)
        {
            using (RegistryKey root = OpenMachineSchemeKey(scheme, false))
            {
                if (root == null)
                {
                    return;
                }

                bool hasOwner = false;
                foreach (string valueName in root.GetValueNames())
                {
                    if (string.Equals(valueName, "URL Protocol", StringComparison.OrdinalIgnoreCase))
                    {
                        if (root.GetValueKind(valueName) != RegistryValueKind.String ||
                            !string.IsNullOrEmpty(Convert.ToString(root.GetValue(
                                valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                                CultureInfo.InvariantCulture)))
                        {
                            throw new InvalidOperationException(
                                "The machine-level " + scheme +
                                " protocol marker changed; refusing to restore it.");
                        }
                    }
                    else if (string.Equals(valueName, OwnerValueName, StringComparison.OrdinalIgnoreCase))
                    {
                        hasOwner = root.GetValueKind(valueName) == RegistryValueKind.String &&
                            string.Equals(Convert.ToString(root.GetValue(
                                valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                                CultureInfo.InvariantCulture), sessionId, StringComparison.Ordinal);
                        if (!hasOwner)
                        {
                            throw new InvalidOperationException(
                                "The machine-level " + scheme +
                                " handler ownership marker changed; refusing to overwrite it.");
                        }
                    }
                    else
                    {
                        throw new InvalidOperationException(
                            "The machine-level " + scheme +
                            " protocol key gained another value; refusing to restore it.");
                    }
                }

                string[] subKeys = root.GetSubKeyNames();
                if (subKeys.Length == 0)
                {
                    if (!hasOwner && root.ValueCount != 0)
                    {
                        throw new InvalidOperationException(
                            "The machine-level " + scheme +
                            " protocol key is not owned by this session.");
                    }

                    return;
                }

                if (!hasOwner || !IsOwnedTreeShapeSafe(root, expectedCommand, false))
                {
                    throw new InvalidOperationException(
                        "The machine-level " + scheme +
                        " protocol command changed; refusing to restore it.");
                }
            }
        }

        private static bool CleanupOwnedArtifacts(SessionState state)
        {
            bool userProtocolComplete = CleanupLegacyUserProtocolArtifacts(state);
            bool machineProtocolComplete = CleanupMachineProtocolArtifacts(state);
            return userProtocolComplete && machineProtocolComplete;
        }

        private static bool CleanupLegacyUserProtocolArtifacts(SessionState state)
        {
            bool complete = true;
            bool changed = false;
            foreach (SchemeState schemeState in state.Schemes)
            {
                string path = SchemePath(schemeState.Scheme);
                using (RegistryKey root = OpenSchemeKey(path, true))
                {
                    if (root == null)
                    {
                        continue;
                    }

                    if (!HasMatchingOwner(root, state.SessionId))
                    {
                        if (IsUnownedEmptyProtocolRoot(root))
                        {
                            if (!schemeState.RootExisted && HasValue(root, "URL Protocol"))
                            {
                                root.DeleteValue("URL Protocol", false);
                                changed = true;
                            }
                        }
                        else
                        {
                            complete = false;
                        }

                        continue;
                    }

                    if (!HasOnlyOwnedRootValues(root) || !IsOwnedTreeShapeSafe(root, state.HandlerCommand, false))
                    {
                        complete = false;
                        continue;
                    }

                    root.DeleteSubKeyTree("shell", false);
                    root.DeleteValue(OwnerValueName, false);
                    if (schemeState.RootExisted)
                    {
                        if (!HasValue(root, "URL Protocol"))
                        {
                            root.SetValue("URL Protocol", string.Empty, RegistryValueKind.String);
                        }
                    }
                    else if (root.SubKeyCount == 0 && root.ValueCount == 1 && IsEmptyProtocolMarker(root))
                    {
                        root.DeleteValue("URL Protocol", false);
                    }

                    changed = true;
                }

                if (!schemeState.RootExisted)
                {
                    DeleteRegistryKeyIfEmpty(path);
                }
            }

            if (changed)
            {
                NotifyAssociationChanged();
            }

            return complete;
        }

        private static bool CleanupMachineProtocolArtifacts(SessionState state)
        {
            if (!state.MachineFallbackCreated)
            {
                return true;
            }

            bool complete = true;
            bool changed = false;
            foreach (string scheme in Schemes)
            {
                bool deleteIfEmpty = false;
                using (RegistryKey root = OpenMachineSchemeKey(scheme, true))
                {
                    if (root == null)
                    {
                        continue;
                    }

                    if (!HasMatchingOwner(root, state.SessionId))
                    {
                        if (IsUnownedEmptyProtocolRoot(root))
                        {
                            if (HasValue(root, "URL Protocol"))
                            {
                                root.DeleteValue("URL Protocol", false);
                                changed = true;
                            }

                            deleteIfEmpty = true;
                        }
                        else
                        {
                            complete = false;
                        }
                    }
                    else if (!HasOnlyOwnedRootValues(root) ||
                        !IsOwnedTreeShapeSafe(root, state.HandlerCommand, false))
                    {
                        complete = false;
                    }
                    else
                    {
                        root.DeleteSubKeyTree("shell", false);
                        root.DeleteValue(OwnerValueName, false);
                        root.DeleteValue("URL Protocol", false);
                        changed = true;
                        deleteIfEmpty = true;
                    }
                }

                if (deleteIfEmpty)
                {
                    DeleteMachineSchemeKeyIfEmpty(scheme);
                }
            }

            if (changed)
            {
                NotifyAssociationChanged();
            }

            return complete;
        }

        private static bool CleanupOrphanedRegistration(BridgeContext context)
        {
            string recoveredSessionId = null;
            List<string> ownedSchemes = new List<string>();
            List<string> ownedMachineSchemes = new List<string>();
            foreach (string scheme in Schemes)
            {
                using (RegistryKey root = OpenSchemeKey(SchemePath(scheme), false))
                {
                    if (root == null || !HasValue(root, OwnerValueName))
                    {
                        continue;
                    }

                    if (root.GetValueKind(OwnerValueName) != RegistryValueKind.String)
                    {
                        return false;
                    }

                    string sessionId = Convert.ToString(root.GetValue(
                        OwnerValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                        CultureInfo.InvariantCulture);
                    Guid parsedSessionId;
                    if (!Guid.TryParseExact(sessionId, "D", out parsedSessionId) ||
                        root.ValueCount != 2 || !IsEmptyProtocolMarker(root) ||
                        !HasOnlyOwnedRootValues(root) ||
                        !IsOwnedTreeShapeSafe(root, CreateHandlerCommand(context.BridgePath, sessionId), true))
                    {
                        return false;
                    }

                    if (recoveredSessionId != null &&
                        !string.Equals(recoveredSessionId, sessionId, StringComparison.Ordinal))
                    {
                        return false;
                    }

                    recoveredSessionId = sessionId;
                    ownedSchemes.Add(scheme);
                }
            }

            foreach (string scheme in Schemes)
            {
                using (RegistryKey root = OpenMachineSchemeKey(scheme, false))
                {
                    if (root == null || !HasValue(root, OwnerValueName))
                    {
                        continue;
                    }

                    if (root.GetValueKind(OwnerValueName) != RegistryValueKind.String)
                    {
                        return false;
                    }

                    string sessionId = Convert.ToString(root.GetValue(
                        OwnerValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                        CultureInfo.InvariantCulture);
                    Guid parsedSessionId;
                    if (!Guid.TryParseExact(sessionId, "D", out parsedSessionId) ||
                        root.ValueCount != 2 || !IsEmptyProtocolMarker(root) ||
                        !HasOnlyOwnedRootValues(root) ||
                        !IsOwnedTreeShapeSafe(root, CreateHandlerCommand(context.BridgePath, sessionId), true))
                    {
                        return false;
                    }

                    if (recoveredSessionId != null &&
                        !string.Equals(recoveredSessionId, sessionId, StringComparison.Ordinal))
                    {
                        return false;
                    }

                    recoveredSessionId = sessionId;
                    ownedMachineSchemes.Add(scheme);
                }
            }

            if (recoveredSessionId == null)
            {
                return true;
            }

            foreach (string scheme in ownedSchemes)
            {
                string path = SchemePath(scheme);
                using (RegistryKey root = OpenSchemeKey(path, true))
                {
                    string expectedCommand = CreateHandlerCommand(context.BridgePath, recoveredSessionId);
                    if (root == null || !HasMatchingOwner(root, recoveredSessionId) ||
                        !HasOnlyOwnedRootValues(root) || !IsOwnedTreeShapeSafe(root, expectedCommand, true))
                    {
                        return false;
                    }

                    root.DeleteSubKeyTree("shell", false);
                    root.DeleteValue(OwnerValueName, false);
                }
            }

            foreach (string scheme in ownedMachineSchemes)
            {
                using (RegistryKey root = OpenMachineSchemeKey(scheme, true))
                {
                    string expectedCommand = CreateHandlerCommand(context.BridgePath, recoveredSessionId);
                    if (root == null || !HasMatchingOwner(root, recoveredSessionId) ||
                        !HasOnlyOwnedRootValues(root) ||
                        !IsOwnedTreeShapeSafe(root, expectedCommand, true))
                    {
                        return false;
                    }

                    root.DeleteSubKeyTree("shell", false);
                    root.DeleteValue(OwnerValueName, false);
                    root.DeleteValue("URL Protocol", false);
                }

                DeleteMachineSchemeKeyIfEmpty(scheme);
            }

            if (ownedSchemes.Count > 0 || ownedMachineSchemes.Count > 0)
            {
                NotifyAssociationChanged();
            }

            return true;
        }

        private static void CleanupLegacyGhBrowserOverride(BridgeContext context)
        {
            bool removed = false;
            using (RegistryKey environment = OpenUserKey("Environment", true))
            {
                removed = RemoveLegacyGhBrowserValue(environment, context.BridgePath) || removed;
            }

            using (RegistryKey machine = RegistryKey.OpenBaseKey(
                RegistryHive.LocalMachine, RegistryView.Registry64))
            using (RegistryKey environment = machine.OpenSubKey(
                "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", true))
            {
                removed = RemoveLegacyGhBrowserValue(environment, context.BridgePath) || removed;
            }

            if (removed)
            {
                NotifyEnvironmentChanged();
            }
        }

        private static bool RemoveLegacyGhBrowserValue(RegistryKey environment, string currentBridgePath)
        {
            if (environment == null || !HasValue(environment, LegacyGhBrowserValueName) ||
                environment.GetValueKind(LegacyGhBrowserValueName) != RegistryValueKind.String)
            {
                return false;
            }

            string command = Convert.ToString(environment.GetValue(
                LegacyGhBrowserValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                CultureInfo.InvariantCulture);
            string commandBridgePath;
            if (!TryParseLegacyGhBrowserCommand(command, out commandBridgePath) ||
                (!SamePath(commandBridgePath, currentBridgePath) && File.Exists(commandBridgePath)))
            {
                return false;
            }

            environment.DeleteValue(LegacyGhBrowserValueName, false);
            return true;
        }

        private static bool TryParseLegacyGhBrowserCommand(string command, out string bridgePath)
        {
            bridgePath = null;
            if (string.IsNullOrWhiteSpace(command))
            {
                return false;
            }

            try
            {
                string[] arguments = ParseCommandLine(command);
                Guid legacySessionId;
                bool validLegacyShape = arguments.Length == 2 ||
                    (arguments.Length == 3 && Guid.TryParseExact(arguments[2], "D", out legacySessionId));
                if (!validLegacyShape ||
                    !string.Equals(arguments[1], "gh-open", StringComparison.OrdinalIgnoreCase) ||
                    !string.Equals(Path.GetFileName(arguments[0]), "FirefoxPortableBridge.exe",
                        StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                bridgePath = NormalizePath(arguments[0]);
                return true;
            }
            catch
            {
                bridgePath = null;
                return false;
            }
        }

        private static bool IsOwnedTreeShapeSafe(RegistryKey root, string expectedCommand, bool requireComplete)
        {
            string[] subKeys = root.GetSubKeyNames();
            if (subKeys.Length == 0)
            {
                return !requireComplete;
            }

            if (subKeys.Length != 1 || !string.Equals(subKeys[0], "shell", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            using (RegistryKey shell = root.OpenSubKey("shell"))
            {
                if (shell == null || shell.ValueCount != 0)
                {
                    return false;
                }

                string[] shellSubKeys = shell.GetSubKeyNames();
                if (shellSubKeys.Length == 0)
                {
                    return !requireComplete;
                }

                if (shellSubKeys.Length != 1 ||
                    !string.Equals(shellSubKeys[0], "open", StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                using (RegistryKey open = shell.OpenSubKey("open"))
                {
                    if (open == null || open.ValueCount != 0)
                    {
                        return false;
                    }

                    string[] openSubKeys = open.GetSubKeyNames();
                    if (openSubKeys.Length == 0)
                    {
                        return !requireComplete;
                    }

                    if (openSubKeys.Length != 1 ||
                        !string.Equals(openSubKeys[0], "command", StringComparison.OrdinalIgnoreCase))
                    {
                        return false;
                    }

                    using (RegistryKey command = open.OpenSubKey("command"))
                    {
                        if (command == null || command.SubKeyCount != 0)
                        {
                            return false;
                        }

                        string[] valueNames = command.GetValueNames();
                        if (valueNames.Length == 0)
                        {
                            return !requireComplete;
                        }

                        return valueNames.Length == 1 && valueNames[0].Length == 0 &&
                            command.GetValueKind(string.Empty) == RegistryValueKind.String &&
                            string.Equals(Convert.ToString(command.GetValue(
                                string.Empty, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                                CultureInfo.InvariantCulture), expectedCommand, StringComparison.Ordinal);
                    }
                }
            }
        }

        private static bool HasOnlyOwnedRootValues(RegistryKey root)
        {
            foreach (string valueName in root.GetValueNames())
            {
                if (string.Equals(valueName, OwnerValueName, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (!string.Equals(valueName, "URL Protocol", StringComparison.OrdinalIgnoreCase) ||
                    root.GetValueKind(valueName) != RegistryValueKind.String ||
                    !string.IsNullOrEmpty(Convert.ToString(root.GetValue(
                        valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture)))
                {
                    return false;
                }
            }

            return true;
        }

        private static bool IsUnownedEmptyProtocolRoot(RegistryKey root)
        {
            if (root.SubKeyCount != 0)
            {
                return false;
            }

            return root.ValueCount == 0 || (root.ValueCount == 1 && IsEmptyProtocolMarker(root));
        }

        private static bool IsEmptyProtocolMarker(RegistryKey root)
        {
            return HasValue(root, "URL Protocol") &&
                root.GetValueKind("URL Protocol") == RegistryValueKind.String &&
                string.IsNullOrEmpty(Convert.ToString(root.GetValue(
                    "URL Protocol", null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture));
        }

        private static bool HasMatchingOwner(RegistryKey root, string sessionId)
        {
            return HasValue(root, OwnerValueName) &&
                root.GetValueKind(OwnerValueName) == RegistryValueKind.String &&
                string.Equals(Convert.ToString(root.GetValue(
                    OwnerValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                    CultureInfo.InvariantCulture), sessionId, StringComparison.Ordinal);
        }

        private static bool HasValue(RegistryKey key, string expectedName)
        {
            foreach (string valueName in key.GetValueNames())
            {
                if (string.Equals(valueName, expectedName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static void DeleteRegistryKeyIfEmpty(string path)
        {
            bool empty = false;
            using (RegistryKey key = OpenUserKey(path, false))
            {
                if (key != null)
                {
                    empty = key.ValueCount == 0 && key.SubKeyCount == 0;
                }
            }

            if (empty)
            {
                DeleteUserKey(path);
            }
        }

        private static RegistryKey OpenUserKey(string path, bool writable)
        {
            bool classes = path.StartsWith("Software\\Classes\\", StringComparison.OrdinalIgnoreCase);
            string relative = classes ? path.Substring("Software\\Classes\\".Length) : path;
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (identity.User == null) throw new InvalidOperationException("The current Windows user SID is unavailable.");
                RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64);
                RegistryKey root = users.OpenSubKey(identity.User.Value + (classes ? "_Classes" : string.Empty), writable);
                RegistryKey key = root == null ? null : root.OpenSubKey(relative, writable);
                if (root != null) root.Dispose();
                users.Dispose();
                return key;
            }
        }

        private static RegistryKey OpenSchemeKey(string path, bool writable)
        {
            const string prefix = "Software\\Classes\\";
            if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("The protocol registry path is invalid.");
            }
            return OpenUserClassesKey(path.Substring(prefix.Length), writable);
        }

        private static RegistryKey CreateSchemeKey(string path)
        {
            const string prefix = "Software\\Classes\\";
            if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("The protocol registry path is invalid.");
            }
            return CreateUserClassesKey(path.Substring(prefix.Length));
        }

        private static RegistryKey OpenMachineSchemeKey(string path, bool writable)
        {
            ValidateMachineSchemePath(path);
            RegistryKey machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            RegistryKey key = machine.OpenSubKey("Software\\Classes\\" + path, writable);
            machine.Dispose();
            return key;
        }

        private static RegistryKey CreateMachineSchemeKey(string path)
        {
            ValidateMachineSchemePath(path);
            RegistryKey machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            RegistryKey key = machine.CreateSubKey("Software\\Classes\\" + path);
            machine.Dispose();
            return key;
        }

        private static void DeleteMachineSchemeKeyIfEmpty(string scheme)
        {
            ValidateMachineSchemePath(scheme);
            bool empty = false;
            using (RegistryKey key = OpenMachineSchemeKey(scheme, false))
            {
                if (key != null)
                {
                    empty = key.ValueCount == 0 && key.SubKeyCount == 0;
                }
            }

            if (!empty)
            {
                return;
            }

            using (RegistryKey machine = RegistryKey.OpenBaseKey(
                RegistryHive.LocalMachine, RegistryView.Registry64))
            using (RegistryKey classes = machine.OpenSubKey("Software\\Classes", true))
            {
                if (classes == null)
                {
                    throw new InvalidOperationException("Could not open HKLM\\Software\\Classes.");
                }

                classes.DeleteSubKey(scheme, false);
            }
        }

        private static void ValidateMachineSchemePath(string path)
        {
            foreach (string scheme in Schemes)
            {
                if (string.Equals(path, scheme, StringComparison.OrdinalIgnoreCase) ||
                    path.StartsWith(scheme + "\\", StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }
            }

            throw new InvalidOperationException("The machine protocol registry path is invalid.");
        }

        private static RegistryKey OpenUserClassesKey(string path, bool writable)
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (identity.User == null) throw new InvalidOperationException("The current Windows user SID is unavailable.");
                RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64);
                RegistryKey root = users.OpenSubKey(identity.User.Value + "_Classes", writable);
                RegistryKey key = root == null ? null : root.OpenSubKey(path, writable);
                if (root != null) root.Dispose();
                users.Dispose();
                return key;
            }
        }

        private static RegistryKey CreateUserClassesKey(string path)
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (identity.User == null) throw new InvalidOperationException("The current Windows user SID is unavailable.");
                RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64);
                RegistryKey root = users.OpenSubKey(identity.User.Value + "_Classes", true);
                RegistryKey key = root == null ? null : root.CreateSubKey(path);
                if (root != null) root.Dispose();
                users.Dispose();
                return key;
            }
        }

        private static void DeleteUserKey(string path)
        {
            bool classes = path.StartsWith("Software\\Classes\\", StringComparison.OrdinalIgnoreCase);
            string relative = classes ? path.Substring("Software\\Classes\\".Length) : path;
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (identity.User == null) throw new InvalidOperationException("The current Windows user SID is unavailable.");
                RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64);
                RegistryKey root = users.OpenSubKey(identity.User.Value + (classes ? "_Classes" : string.Empty), true);
                if (root != null) root.DeleteSubKey(relative, false);
                if (root != null) root.Dispose();
                users.Dispose();
            }
        }

        private static void ValidateState(SessionState state)
        {
            if (state == null || state.SchemaVersion != CurrentSchemaVersion || !BrowserSupport.IsSupported(state.Browser) ||
                (!string.Equals(state.Phase, PendingPhase, StringComparison.Ordinal) &&
                 !string.Equals(state.Phase, ActivePhase, StringComparison.Ordinal) &&
                 !string.Equals(state.Phase, StandbyPhase, StringComparison.Ordinal) &&
                 !string.Equals(state.Phase, CleaningPhase, StringComparison.Ordinal)) ||
                string.IsNullOrWhiteSpace(state.SessionId) || string.IsNullOrWhiteSpace(state.BridgePath) ||
                string.IsNullOrWhiteSpace(state.BrowserPath) || string.IsNullOrWhiteSpace(state.ProfilePath) ||
                string.IsNullOrWhiteSpace(state.CreatedUtc) || state.EnvironmentVariables == null || state.Schemes == null ||
                !BrowserSupport.IsAbsolutePath(state.BrowserPath) || !BrowserSupport.IsAbsolutePath(state.ProfilePath) ||
                !string.Equals(Path.GetFileName(state.BrowserPath), BrowserSupport.ExecutableName(state.Browser), StringComparison.OrdinalIgnoreCase) ||
                !BrowserSupport.ValidProfileDirectory(state.Browser, state.ProfileDirectory) ||
                (state.Browser == BrowserSupport.Chrome && state.EnvironmentVariables.Length != 0))
            {
                throw new InvalidOperationException("The persistent monitor session state is incomplete.");
            }

            Guid parsedSessionId;
            if (!Guid.TryParseExact(state.SessionId, "D", out parsedSessionId) ||
                !string.Equals(state.HandlerCommand,
                    CreateHandlerCommand(state.BridgePath, state.SessionId), StringComparison.Ordinal))
            {
                throw new InvalidOperationException("The persistent monitor session identity is invalid.");
            }

            ParseUtc(state.CreatedUtc, "session creation time");
            if (state.StartedUtc != null) ParseUtc(state.StartedUtc, "browser start time");
            if ((state.Phase == ActivePhase || state.Phase == StandbyPhase) && state.StartedUtc == null)
                throw new InvalidOperationException("A running session is missing its process start identity.");
            ValidateEnvironmentVariables(state.EnvironmentVariables);
            if (string.Equals(state.Phase, PendingPhase, StringComparison.Ordinal))
            {
                ParseUtc(state.ExpiresUtc, "announcement expiration");
                if (state.Schemes.Length != 0 || state.FallbackActive ||
                    state.MachineFallbackCreated || state.ProtocolFallbackActive)
                {
                    throw new InvalidOperationException("The pending monitor session state is invalid.");
                }

                return;
            }

            if (state.Phase == StandbyPhase || state.Phase == CleaningPhase)
            {
                if (state.FallbackActive || state.ProtocolFallbackActive || state.MachineFallbackCreated)
                    throw new InvalidOperationException("An inactive session still owns a URL handler.");
                return;
            }

            if (state.Schemes.Length != 2)
            {
                throw new InvalidOperationException("The monitor session scheme state is incomplete.");
            }

            HashSet<string> found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (SchemeState schemeState in state.Schemes)
            {
                if (schemeState == null ||
                    (!string.Equals(schemeState.Scheme, "http", StringComparison.OrdinalIgnoreCase) &&
                     !string.Equals(schemeState.Scheme, "https", StringComparison.OrdinalIgnoreCase)) ||
                    !found.Add(schemeState.Scheme))
                {
                    throw new InvalidOperationException("The monitor session scheme state is invalid.");
                }
            }

            if (state.ProtocolFallbackActive &&
                (!state.MachineFallbackCreated || !state.FallbackActive))
            {
                throw new InvalidOperationException(
                    "The effective protocol fallback state is inconsistent.");
            }

            if (string.Equals(state.Phase, CleaningPhase, StringComparison.Ordinal) &&
                (state.FallbackActive || state.ProtocolFallbackActive))
            {
                throw new InvalidOperationException("The cleaning monitor session is still open for URL delivery.");
            }
        }

        private static void ValidateEnvironmentVariables(EnvironmentVariableState[] variables)
        {
            if (variables == null || variables.Length > PortableEnvironmentNames.Length)
            {
                throw new InvalidOperationException("The portable Firefox environment is invalid.");
            }

            HashSet<string> found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (EnvironmentVariableState variable in variables)
            {
                if (variable == null || string.IsNullOrWhiteSpace(variable.Name) ||
                    string.IsNullOrWhiteSpace(variable.Value) || !found.Add(variable.Name) ||
                    Array.FindIndex(PortableEnvironmentNames, delegate(string allowed)
                    {
                        return string.Equals(allowed, variable.Name, StringComparison.OrdinalIgnoreCase);
                    }) < 0)
                {
                    throw new InvalidOperationException("The portable Firefox environment contains an invalid variable.");
                }
            }
        }

        private static void WriteStoreAtomic(string statePath, SessionStore store)
        {
            ValidateStore(store);
            string parent = Path.GetDirectoryName(statePath);
            Directory.CreateDirectory(parent);
            string temporaryPath = Path.Combine(
                parent, "." + Path.GetFileName(statePath) + "." + Guid.NewGuid().ToString("N") + ".tmp");
            string backupPath = temporaryPath + ".backup";
            try
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(SessionStore));
                using (FileStream stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    serializer.WriteObject(stream, store);
                    stream.Flush(true);
                }

                if (File.Exists(statePath))
                {
                    File.Replace(temporaryPath, statePath, backupPath, true);
                    File.Delete(backupPath);
                }
                else
                {
                    File.Move(temporaryPath, statePath);
                }
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }

                if (File.Exists(backupPath))
                {
                    File.Delete(backupPath);
                }
            }
        }

        private static T ExecuteWithStateMutex<T>(BridgeContext context, Func<T> action)
        {
            using (Mutex mutex = new Mutex(false, context.StateMutexName))
            {
                bool acquired = false;
                try
                {
                    try
                    {
                        acquired = mutex.WaitOne(30000);
                    }
                    catch (AbandonedMutexException)
                    {
                        acquired = true;
                    }

                    if (!acquired)
                    {
                        throw new TimeoutException("Timed out waiting for exclusive access to the monitor session state.");
                    }

                    return action();
                }
                finally
                {
                    if (acquired)
                    {
                        mutex.ReleaseMutex();
                    }
                }
            }
        }

        private static Dictionary<string, string> ToEnvironmentDictionary(EnvironmentVariableState[] variables)
        {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (EnvironmentVariableState variable in variables)
            {
                result.Add(variable.Name, variable.Value);
            }

            return result;
        }

        private static string CreateHandlerCommand(string bridgePath, string sessionId)
        {
            return QuoteArgument(bridgePath) + " open " + sessionId + " \"%1\"";
        }

        private static string SchemePath(string scheme)
        {
            return "Software\\Classes\\" + scheme;
        }

        private static void NotifyAssociationChanged()
        {
            SHChangeNotify(AssociationChanged, AssociationChangedNotifyFlags, IntPtr.Zero, IntPtr.Zero);
            Thread.Sleep(1000);
        }

        private static void NotifyEnvironmentChanged()
        {
            UIntPtr result;
            SendMessageTimeout(
                new IntPtr(0xffff), WmSettingChange, UIntPtr.Zero, "Environment",
                SmtoAbortIfHung, 5000, out result);
        }

        private static string NormalizePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("A path is required.", "path");
            }

            string fullPath = Path.GetFullPath(path);
            string rootPath = Path.GetPathRoot(fullPath);
            if (!string.IsNullOrEmpty(rootPath) &&
                string.Equals(fullPath, rootPath, StringComparison.OrdinalIgnoreCase))
            {
                return rootPath;
            }

            return fullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }

        internal static bool SamePath(string first, string second)
        {
            return !string.IsNullOrWhiteSpace(first) && !string.IsNullOrWhiteSpace(second) &&
                string.Equals(NormalizePath(first), NormalizePath(second), StringComparison.OrdinalIgnoreCase);
        }

        private static bool SameOptionalPath(string first, string second)
        {
            if (string.IsNullOrWhiteSpace(first) || string.IsNullOrWhiteSpace(second))
            {
                return string.IsNullOrWhiteSpace(first) && string.IsNullOrWhiteSpace(second);
            }

            return SamePath(first, second);
        }

        private static DateTime ParseUtc(string value, string name)
        {
            DateTime parsed;
            if (string.IsNullOrWhiteSpace(value) ||
                !DateTime.TryParse(value, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out parsed))
            {
                throw new InvalidOperationException("The " + name + " is invalid.");
            }

            return parsed.ToUniversalTime();
        }

        private static string ComputeIdentity(string value)
        {
            using (SHA256 algorithm = SHA256.Create())
            {
                byte[] bytes = algorithm.ComputeHash(Encoding.UTF8.GetBytes(value.ToUpperInvariant()));
                StringBuilder builder = new StringBuilder(24);
                for (int index = 0; index < 12; index++)
                {
                    builder.Append(bytes[index].ToString("x2", CultureInfo.InvariantCulture));
                }

                return builder.ToString();
            }
        }

        internal static string QuoteArgument(string argument)
        {
            if (argument == null)
            {
                return "\"\"";
            }

            StringBuilder result = new StringBuilder();
            result.Append('"');
            int backslashes = 0;
            foreach (char character in argument)
            {
                if (character == '\\')
                {
                    backslashes++;
                    continue;
                }

                if (character == '"')
                {
                    result.Append('\\', backslashes * 2 + 1);
                    result.Append('"');
                    backslashes = 0;
                    continue;
                }

                result.Append('\\', backslashes);
                backslashes = 0;
                result.Append(character);
            }

            result.Append('\\', backslashes * 2);
            result.Append('"');
            return result.ToString();
        }

        private static string EmptyToNull(string value)
        {
            return string.IsNullOrEmpty(value) ? null : value;
        }

        private static void WriteError(BridgeContext context, Exception exception)
        {
            try
            {
                Directory.CreateDirectory(context.DataPath);
                string text = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) + Environment.NewLine +
                    exception.ToString() + Environment.NewLine;
                File.WriteAllText(context.ErrorPath, text, new UTF8Encoding(false));
            }
            catch
            {
            }
        }

        private static void WriteOpenTrace(
            BridgeContext context, Uri url, string channel, int result, Exception previousException)
        {
            try
            {
                string authority = url.Scheme + "://" + url.DnsSafeHost;
                if (!url.IsDefaultPort)
                {
                    authority += ":" + url.Port.ToString(CultureInfo.InvariantCulture);
                }

                string text = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) +
                    " caller=" + GetParentProcessName() + " target=" + authority + " channel=" + channel +
                    " result=" + result.ToString(CultureInfo.InvariantCulture) +
                    " previousFailure=" + (previousException == null ? "none" : previousException.GetType().Name) +
                    Environment.NewLine;
                File.WriteAllText(context.OpenTracePath, text, new UTF8Encoding(false));
            }
            catch
            {
            }
        }

        private static string GetParentProcessName()
        {
            try
            {
                int processId = Process.GetCurrentProcess().Id;
                using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                    "SELECT ParentProcessId FROM Win32_Process WHERE ProcessId = " +
                    processId.ToString(CultureInfo.InvariantCulture)))
                using (ManagementObjectCollection results = searcher.Get())
                {
                    foreach (ManagementObject process in results)
                    {
                        using (process)
                        using (Process parent = Process.GetProcessById(Convert.ToInt32(
                            process["ParentProcessId"], CultureInfo.InvariantCulture)))
                        {
                            return parent.ProcessName;
                        }
                    }
                }
            }
            catch
            {
            }

            return "unknown";
        }

        private static void DeleteErrorLog(BridgeContext context)
        {
            try
            {
                File.Delete(context.ErrorPath);
            }
            catch
            {
            }
        }
    }
}
