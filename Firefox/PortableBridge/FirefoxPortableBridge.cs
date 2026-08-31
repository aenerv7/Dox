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
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("Firefox Portable Bridge")]
[assembly: System.Reflection.AssemblyDescription("Session-scoped HTTP(S) fallback for portable Firefox")]
[assembly: System.Reflection.AssemblyCompany("Firefox Portable")]
[assembly: System.Reflection.AssemblyProduct("Firefox Portable Bridge")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]

namespace FirefoxPortable
{
    [DataContract]
    internal sealed class UrlHandlerState
    {
        [DataMember(Order = 1)] public int SchemaVersion;
        [DataMember(Order = 2)] public string SessionId;
        [DataMember(Order = 3)] public string RootPath;
        [DataMember(Order = 4)] public string BrokerPath;
        [DataMember(Order = 5)] public string HandlerCommand;
        [DataMember(Order = 6)] public string CreatedUtc;
        [DataMember(Order = 7)] public SchemeState[] Schemes;
        [DataMember(Order = 8, EmitDefaultValue = false)] public bool GhBrowserCreated;
        [DataMember(Order = 9, EmitDefaultValue = false)] public string GhBrowserCommand;
    }

    [DataContract]
    internal sealed class SchemeState
    {
        [DataMember(Order = 1)] public string Scheme;
        [DataMember(Order = 2)] public bool RootExisted;
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

    internal sealed class PortableContext
    {
        internal string RootPath;
        internal string AppPath;
        internal string DataPath;
        internal string ProfilePath;
        internal string FirefoxPath;
        internal string BridgePath;
        internal string StatePath;
        internal string ErrorPath;
        internal string OpenTracePath;
        internal string LegacyShimPath;
        internal string LegacyShimTemporaryPath;
        internal string LegacyHandlerCommand;
        internal string HandlerCommand;
        internal string PipeName;
        internal string MutexName;
        internal string StateMutexName;
    }

    internal static class Program
    {
        private const string OwnerValueName = "FirefoxPortableSessionId";
        private const int AssociationChanged = unchecked((int)0x08000000);
        private const uint AssociationChangedNotifyFlags = 0x00001003; // SHCNF_DWORD | SHCNF_FLUSH
        private const uint AssociationQueryFlags = 0x00001040; // ASSOCF_IS_PROTOCOL | ASSOCF_VERIFY
        private const uint AssociationStringCommand = 1; // ASSOCSTR_COMMAND
        private const uint ErrorNoAssociationHResult = 0x80070483;
        private const string GhBrowserValueName = "GH_BROWSER";
        private const string LegacyProtectedFallbackProgId = "MSEdgeHTM";
        private const uint WmSettingChange = 0x001A;
        private const uint SmtoAbortIfHung = 0x0002;
        private const int InitialSchemeStabilizationMilliseconds = 5000;
        private const int InitialSchemePollMilliseconds = 100;
        private const string LegacyOpenUrlShimContent =
            "# FirefoxPortableBridge session compatibility shim v1\r\n" +
            "param([Parameter(Mandatory=$true)][string]$Url)\r\n" +
            "$bridgePath = Join-Path -Path $PSScriptRoot -ChildPath 'FirefoxPortableBridge.exe'\r\n" +
            "if (-not (Test-Path -LiteralPath $bridgePath -PathType Leaf)) { exit 2 }\r\n" +
            "& $bridgePath 'open' $Url\r\n" +
            "exit $LASTEXITCODE\r\n";
        private static readonly string[] Schemes = { "http", "https" };
        private static readonly Regex ContentProcessPattern = new Regex(
            @"(?:^|\s)-contentproc(?:\s|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        private static readonly Regex NoRemotePattern = new Regex(
            @"(?:^|\s)--?no-remote(?:\s|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

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
            try
            {
                if (args.Length == 2 && string.Equals(args[0], "open", StringComparison.OrdinalIgnoreCase))
                {
                    PortableContext openContext = CreateContext(GetRootFromBridgePath());
                    return OpenUrl(openContext, args[1]);
                }

                if (args.Length == 1)
                {
                    PortableContext browserOverrideContext = CreateContext(GetRootFromBridgePath());
                    return OpenUrl(browserOverrideContext, args[0]);
                }

                if (args.Length == 3 && string.Equals(args[0], "gh-open", StringComparison.OrdinalIgnoreCase))
                {
                    PortableContext ghBrowserContext = CreateContext(GetRootFromBridgePath());
                    return OpenGhBrowserUrl(ghBrowserContext, args[1], args[2]);
                }

                if (args.Length == 3 &&
                    (string.Equals(args[0], "watch", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(args[0], "cleanup", StringComparison.OrdinalIgnoreCase)) &&
                    string.Equals(args[1], "--root", StringComparison.OrdinalIgnoreCase))
                {
                    PortableContext context = CreateContext(args[2]);
                    AssertBridgeOwnsRoot(context);
                    if (string.Equals(args[0], "watch", StringComparison.OrdinalIgnoreCase))
                    {
                        return Watch(context);
                    }

                    return Cleanup(context) ? 0 : 2;
                }

                return 64;
            }
            catch (Exception exception)
            {
                TryWriteError(exception);
                return 1;
            }
        }

        private static PortableContext CreateContext(string rootPath)
        {
            string normalizedRoot = NormalizePath(rootPath);
            string bridgePath = NormalizePath(Process.GetCurrentProcess().MainModule.FileName);
            string legacyShimPath = Path.Combine(normalizedRoot, "Tools", "OpenUrl.ps1");
            string windowsPowerShellPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            string identity = ComputeIdentity(normalizedRoot);
            return new PortableContext
            {
                RootPath = normalizedRoot,
                AppPath = Path.Combine(normalizedRoot, "App"),
                DataPath = Path.Combine(normalizedRoot, "Data"),
                ProfilePath = Path.Combine(normalizedRoot, "Data", "profile"),
                FirefoxPath = Path.Combine(normalizedRoot, "App", "firefox.exe"),
                BridgePath = bridgePath,
                StatePath = Path.Combine(normalizedRoot, "Data", "runtime-url-handler.json"),
                ErrorPath = Path.Combine(normalizedRoot, "Data", "runtime-url-handler.error.log"),
                OpenTracePath = Path.Combine(normalizedRoot, "Data", "runtime-url-handler.open.log"),
                LegacyShimPath = legacyShimPath,
                LegacyShimTemporaryPath = Path.Combine(normalizedRoot, "Tools", ".OpenUrl.ps1.firefox-portable.tmp"),
                LegacyHandlerCommand = QuoteArgument(windowsPowerShellPath) +
                    " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " +
                    QuoteArgument(legacyShimPath) + " -Url \"%1\"",
                HandlerCommand = QuoteArgument(bridgePath) + " open \"%1\"",
                PipeName = "FirefoxPortableBridge-" + identity,
                MutexName = "Local\\FirefoxPortableBridge-" + identity,
                StateMutexName = "Local\\FirefoxPortableBridge-State-" + identity
            };
        }

        private static string GetRootFromBridgePath()
        {
            string bridgePath = NormalizePath(Process.GetCurrentProcess().MainModule.FileName);
            DirectoryInfo toolsDirectory = Directory.GetParent(bridgePath);
            if (toolsDirectory == null || toolsDirectory.Parent == null)
            {
                throw new InvalidOperationException("The bridge is not inside a portable Tools directory.");
            }

            return toolsDirectory.Parent.FullName;
        }

        private static void AssertBridgeOwnsRoot(PortableContext context)
        {
            string expectedRoot = NormalizePath(GetRootFromBridgePath());
            if (!SamePath(expectedRoot, context.RootPath))
            {
                throw new InvalidOperationException("The requested root does not contain this bridge executable.");
            }

            string expectedBridge = Path.Combine(context.RootPath, "Tools", "FirefoxPortableBridge.exe");
            if (!SamePath(expectedBridge, context.BridgePath))
            {
                throw new InvalidOperationException("The bridge executable is not in the portable Tools directory.");
            }
        }

        private static int Watch(PortableContext context)
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, context.MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    return 0;
                }

                try
                {
                    DateTime deadline = DateTime.UtcNow.AddSeconds(90);
                    bool browserRunning = false;
                    while (DateTime.UtcNow < deadline)
                    {
                        bool querySucceeded;
                        browserRunning = IsRemoteEnabledFirefoxRunning(context, out querySucceeded);
                        if (querySucceeded && browserRunning)
                        {
                            break;
                        }

                        Thread.Sleep(250);
                    }

                    if (!browserRunning)
                    {
                        Cleanup(context);
                        return 3;
                    }

                    StartPipeServer(context);

                    DateTime? idleSince = null;
                    bool fallbackActive = TryEnsureRegistration(context);
                    DateTime nextRegistrationCheck = DateTime.UtcNow.AddSeconds(2);
                    while (true)
                    {
                        bool querySucceeded;
                        browserRunning = IsRemoteEnabledFirefoxRunning(context, out querySucceeded);
                        if (!querySucceeded)
                        {
                            Thread.Sleep(500);
                            continue;
                        }

                        if (browserRunning)
                        {
                            idleSince = null;
                            if (DateTime.UtcNow >= nextRegistrationCheck)
                            {
                                fallbackActive = TryEnsureRegistration(context);
                                nextRegistrationCheck = DateTime.UtcNow.AddSeconds(2);
                            }
                        }
                        else
                        {
                            if (fallbackActive)
                            {
                                Cleanup(context);
                                fallbackActive = false;
                            }

                            if (!idleSince.HasValue)
                            {
                                idleSince = DateTime.UtcNow;
                            }
                            else if ((DateTime.UtcNow - idleSince.Value).TotalSeconds >= 5)
                            {
                                bool finalQuerySucceeded;
                                if (!IsRemoteEnabledFirefoxRunning(context, out finalQuerySucceeded) && finalQuerySucceeded)
                                {
                                    break;
                                }
                            }
                        }

                        Thread.Sleep(500);
                    }

                    return 0;
                }
                catch (Exception exception)
                {
                    WriteError(context, exception);
                    return 1;
                }
                finally
                {
                    try
                    {
                        Cleanup(context);
                    }
                    catch (Exception exception)
                    {
                        WriteError(context, exception);
                    }

                    bool querySucceeded;
                    if (!IsRemoteEnabledFirefoxRunning(context, out querySucceeded) && querySucceeded)
                    {
                        RunPortableCleanup(context);
                    }
                }
            }
        }

        private static bool TryEnsureRegistration(PortableContext context)
        {
            try
            {
                EnsureRegistration(context);
                DeleteErrorLog(context);
                return true;
            }
            catch (UserChoiceConflictException exception)
            {
                if (!Cleanup(context))
                {
                    throw new InvalidOperationException(
                        "The session fallback could not be paused after a UserChoice conflict.", exception);
                }

                WriteError(context, exception);
                return false;
            }
        }

        private static void StartPipeServer(PortableContext context)
        {
            Thread serverThread = new Thread(delegate()
            {
                while (true)
                {
                    try
                    {
                        using (NamedPipeServerStream server = new NamedPipeServerStream(
                            context.PipeName,
                            PipeDirection.InOut,
                            4,
                            PipeTransmissionMode.Byte,
                            PipeOptions.None))
                        {
                            server.WaitForConnection();
                            using (BinaryReader reader = new BinaryReader(server, Encoding.UTF8, true))
                            using (BinaryWriter writer = new BinaryWriter(server, Encoding.UTF8, true))
                            {
                                string rawUrl = reader.ReadString();
                                int result = DeliverUrl(context, rawUrl);
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
            serverThread.Name = "FirefoxPortableBridgePipe";
            serverThread.Start();
        }

        private static int SendUrlToWatcher(PortableContext context, string rawUrl)
        {
            using (NamedPipeClientStream client = new NamedPipeClientStream(
                ".", context.PipeName, PipeDirection.InOut, PipeOptions.None))
            {
                client.Connect(3000);
                using (BinaryWriter writer = new BinaryWriter(client, Encoding.UTF8, true))
                using (BinaryReader reader = new BinaryReader(client, Encoding.UTF8, true))
                {
                    writer.Write(rawUrl);
                    writer.Flush();
                    return reader.ReadInt32();
                }
            }
        }

        private static int OpenUrl(PortableContext context, string rawUrl)
        {
            Uri url;
            if (!TryValidateUrl(rawUrl, out url))
            {
                return 65;
            }

            Exception pipeException = null;
            try
            {
                int pipeResult = SendUrlToWatcher(context, rawUrl);
                if (pipeResult == 0)
                {
                    WriteOpenTrace(context, url, "pipe", pipeResult, null);
                    return 0;
                }

                pipeException = new InvalidOperationException(
                    "The watcher returned URL delivery code " +
                    pipeResult.ToString(CultureInfo.InvariantCulture) + ".");
            }
            catch (Exception exception)
            {
                pipeException = exception;
            }

            try
            {
                int directResult = DeliverUrl(context, rawUrl);
                WriteOpenTrace(context, url, "direct-fallback", directResult, pipeException);
                if (directResult != 0)
                {
                    WriteError(context, new InvalidOperationException(
                        "Both watcher and direct URL delivery failed. Direct delivery returned code " +
                        directResult.ToString(CultureInfo.InvariantCulture) + ".", pipeException));
                }

                return directResult;
            }
            catch (Exception directException)
            {
                AggregateException combinedException = new AggregateException(
                    "Both watcher and direct URL delivery failed.", pipeException, directException);
                WriteOpenTrace(context, url, "direct-fallback", 1, combinedException);
                throw combinedException;
            }
        }

        private static int DeliverUrl(PortableContext context, string rawUrl)
        {
            Uri url;
            if (!TryValidateUrl(rawUrl, out url))
            {
                return 65;
            }

            bool querySucceeded;
            if (!IsRemoteEnabledFirefoxRunning(context, out querySucceeded) || !querySucceeded)
            {
                return 69;
            }

            Directory.CreateDirectory(context.ProfilePath);
            string portableTemp = Path.Combine(context.DataPath, "temp");
            string portableRoaming = Path.Combine(context.DataPath, "appdata", "roaming");
            string portableLocal = Path.Combine(context.DataPath, "appdata", "local");
            string crashEvents = Path.Combine(context.DataPath, "crash-reports", "events");
            string crashPings = Path.Combine(context.DataPath, "appdata", "roaming", "Pending Pings");
            Directory.CreateDirectory(portableTemp);
            Directory.CreateDirectory(portableRoaming);
            Directory.CreateDirectory(portableLocal);
            Directory.CreateDirectory(crashEvents);
            Directory.CreateDirectory(crashPings);

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = context.FirefoxPath,
                Arguments = "--profile " + QuoteArgument(context.ProfilePath) + " -url " + QuoteArgument(url.AbsoluteUri),
                WorkingDirectory = context.AppPath,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            startInfo.EnvironmentVariables["TEMP"] = portableTemp;
            startInfo.EnvironmentVariables["TMP"] = portableTemp;
            startInfo.EnvironmentVariables["MOZ_APP_DATA"] = portableRoaming;
            startInfo.EnvironmentVariables["MOZ_LOCAL_APP_DATA"] = portableLocal;
            startInfo.EnvironmentVariables["MOZ_CRASHREPORTER_DISABLE"] = "1";
            startInfo.EnvironmentVariables["MOZ_CRASHREPORTER_DATA_DIRECTORY"] = Path.Combine(portableRoaming, "Crash Reports");
            startInfo.EnvironmentVariables["MOZ_CRASHREPORTER_EVENTS_DIRECTORY"] = crashEvents;
            startInfo.EnvironmentVariables["MOZ_CRASHREPORTER_PING_DIRECTORY"] = crashPings;
            startInfo.EnvironmentVariables["CRASHES_EVENTS_DIR"] = crashEvents;

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

        private static bool IsRemoteEnabledFirefoxRunning(PortableContext context, out bool querySucceeded)
        {
            querySucceeded = false;
            try
            {
                using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                    "SELECT ExecutablePath, CommandLine FROM Win32_Process WHERE Name = 'firefox.exe'"))
                using (ManagementObjectCollection results = searcher.Get())
                {
                    foreach (ManagementObject process in results)
                    {
                        using (process)
                        {
                            string executablePath = Convert.ToString(process["ExecutablePath"], CultureInfo.InvariantCulture);
                            if (string.IsNullOrWhiteSpace(executablePath) || !SamePath(executablePath, context.FirefoxPath))
                            {
                                continue;
                            }

                            string commandLine = Convert.ToString(process["CommandLine"], CultureInfo.InvariantCulture) ?? string.Empty;
                            if (!ContentProcessPattern.IsMatch(commandLine) && !NoRemotePattern.IsMatch(commandLine))
                            {
                                querySucceeded = true;
                                return true;
                            }
                        }
                    }
                }

                querySucceeded = true;
                return false;
            }
            catch
            {
                return false;
            }
        }

        private static void EnsureRegistration(PortableContext context)
        {
            ExecuteWithStateMutex<object>(context, delegate()
            {
                EnsureRegistrationCore(context);
                return null;
            });
        }

        private static void EnsureRegistrationCore(PortableContext context)
        {
            if (CleanupLegacyPowerShellRegistrations(context))
            {
                NotifyAssociationChanged();
            }

            WaitForNoUserChoice(context);
            EnsureRegistrationStateCore(context);
            EnsureLegacyOpenUrlShim(context);
        }

        private static int OpenGhBrowserUrl(PortableContext context, string sessionId, string rawUrl)
        {
            Guid parsedSessionId;
            if (!Guid.TryParseExact(sessionId, "D", out parsedSessionId))
            {
                return 65;
            }

            UrlHandlerState state = ReadState(context.StatePath);
            if (state == null || state.SchemaVersion != 3 || !state.GhBrowserCreated ||
                !string.Equals(state.SessionId, sessionId, StringComparison.OrdinalIgnoreCase) ||
                !SamePath(state.RootPath, context.RootPath) ||
                !SamePath(state.BrokerPath, context.BridgePath) ||
                !string.Equals(state.HandlerCommand, context.HandlerCommand, StringComparison.Ordinal) ||
                !string.Equals(state.GhBrowserCommand,
                    CreateGhBrowserCommand(context.BridgePath, sessionId), StringComparison.Ordinal))
            {
                return 66;
            }

            return OpenUrl(context, rawUrl);
        }

        private static void EnsureRegistrationStateCore(PortableContext context)
        {
            UrlHandlerState state = ReadState(context.StatePath);
            if (state != null)
            {
                if (state.SchemaVersion < 3)
                {
                    if (!CleanupState(context.StatePath, state))
                    {
                        throw new InvalidOperationException("The previous URL handler session could not be migrated safely.");
                    }

                    state = null;
                }
            }

            if (state != null)
            {
                if (!SamePath(state.RootPath, context.RootPath) ||
                    !SamePath(state.BrokerPath, context.BridgePath) ||
                    !string.Equals(state.HandlerCommand, context.HandlerCommand, StringComparison.Ordinal))
                {
                    if (!CleanupState(context.StatePath, state))
                    {
                        throw new InvalidOperationException("The URL handler state belongs to another portable location or command and could not be cleaned safely.");
                    }

                    state = null;
                }
                else
                {
                    if (IsGhBrowserOverrideExternallyReplaced(state))
                    {
                        state.GhBrowserCreated = false;
                        WriteStateAtomic(context.StatePath, state);
                    }

                    if (IsRegistrationActive(state))
                    {
                        return;
                    }

                    foreach (SchemeState schemeState in state.Schemes)
                    {
                        AssertCanRestore(schemeState.Scheme, state.SessionId, state.HandlerCommand);
                    }

                    WriteRegistration(state);
                    NotifyAssociationChanged();
                    return;
                }
            }

            UrlHandlerState recoveredState;
            List<SchemeState> schemeStates = ReadInitialSchemeStatesWhenStable(context, out recoveredState);
            if (recoveredState != null)
            {
                AssertNoUserChoice(context);
                WriteStateAtomic(context.StatePath, recoveredState);
                try
                {
                    WriteRegistration(recoveredState);
                    NotifyAssociationChanged();
                    return;
                }
                catch
                {
                    CleanupState(context.StatePath, recoveredState);
                    throw;
                }
            }

            AssertNoUserChoice(context);

            string newSessionId = Guid.NewGuid().ToString("D");
            bool createGhBrowser = ShouldCreateGhBrowserOverride();
            UrlHandlerState newState = new UrlHandlerState
            {
                SchemaVersion = 3,
                SessionId = newSessionId,
                RootPath = context.RootPath,
                BrokerPath = context.BridgePath,
                HandlerCommand = context.HandlerCommand,
                CreatedUtc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                Schemes = schemeStates.ToArray(),
                GhBrowserCreated = createGhBrowser,
                GhBrowserCommand = CreateGhBrowserCommand(context.BridgePath, newSessionId)
            };
            WriteStateAtomic(context.StatePath, newState);
            try
            {
                WriteRegistration(newState);
                NotifyAssociationChanged();
            }
            catch
            {
                CleanupState(context.StatePath, newState);
                throw;
            }
        }

        private static UrlHandlerState TryRecoverOwnedRegistration(PortableContext context)
        {
            string recoveredSessionId = null;
            List<SchemeState> schemeStates = new List<SchemeState>();
            foreach (string scheme in Schemes)
            {
                using (RegistryKey root = Registry.CurrentUser.OpenSubKey(SchemePath(scheme)))
                {
                    if (root == null)
                    {
                        schemeStates.Add(new SchemeState { Scheme = scheme, RootExisted = false });
                        continue;
                    }

                    if (IsUnownedEmptyProtocolRoot(root))
                    {
                        schemeStates.Add(new SchemeState { Scheme = scheme, RootExisted = true });
                        continue;
                    }

                    string sessionId = ReadRecoverableSessionId(root, context.HandlerCommand);
                    if (sessionId == null)
                    {
                        return null;
                    }

                    if (recoveredSessionId == null)
                    {
                        recoveredSessionId = sessionId;
                    }
                    else if (!string.Equals(recoveredSessionId, sessionId, StringComparison.Ordinal))
                    {
                        return null;
                    }

                    schemeStates.Add(new SchemeState { Scheme = scheme, RootExisted = true });
                }
            }

            if (recoveredSessionId == null)
            {
                return null;
            }

            string recoveredGhBrowserCommand = CreateGhBrowserCommand(context.BridgePath, recoveredSessionId);
            bool recoverGhBrowser = ShouldCreateGhBrowserOverride() ||
                IsCurrentGhBrowserCommand(recoveredGhBrowserCommand);
            return new UrlHandlerState
            {
                SchemaVersion = 3,
                SessionId = recoveredSessionId,
                RootPath = context.RootPath,
                BrokerPath = context.BridgePath,
                HandlerCommand = context.HandlerCommand,
                CreatedUtc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                Schemes = schemeStates.ToArray(),
                GhBrowserCreated = recoverGhBrowser,
                GhBrowserCommand = recoveredGhBrowserCommand
            };
        }

        private static string ReadRecoverableSessionId(RegistryKey root, string expectedCommand)
        {
            if (root.ValueCount != 2 ||
                !IsEmptyProtocolMarker(root) ||
                !HasOnlyOwnedRootValues(root) ||
                !HasValue(root, OwnerValueName) ||
                root.GetValueKind(OwnerValueName) != RegistryValueKind.String ||
                !IsOwnedTreeShapeSafe(root, expectedCommand, true))
            {
                return null;
            }

            string sessionId = Convert.ToString(root.GetValue(
                OwnerValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture);
            Guid parsedSessionId;
            if (!Guid.TryParseExact(sessionId, "D", out parsedSessionId))
            {
                return null;
            }

            return parsedSessionId.ToString("D");
        }

        private static List<SchemeState> ReadInitialSchemeStatesWhenStable(
            PortableContext context, out UrlHandlerState recoveredState)
        {
            recoveredState = null;
            Stopwatch stopwatch = Stopwatch.StartNew();
            InvalidOperationException lastException = null;
            while (true)
            {
                recoveredState = TryRecoverOwnedRegistration(context);
                if (recoveredState != null)
                {
                    return null;
                }

                try
                {
                    List<SchemeState> schemeStates = new List<SchemeState>();
                    foreach (string scheme in Schemes)
                    {
                        schemeStates.Add(ReadInitialSchemeState(scheme));
                    }

                    return schemeStates;
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

            throw new InvalidOperationException(
                "The per-user HTTP(S) protocol keys did not become safe for session fallback within " +
                InitialSchemeStabilizationMilliseconds.ToString(CultureInfo.InvariantCulture) + " ms.",
                lastException);
        }

        private static void AssertNoUserChoice(PortableContext context)
        {
            foreach (string scheme in Schemes)
            {
                foreach (string choiceName in new[] { "UserChoice", "UserChoiceLatest" })
                {
                    string path = "Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\" +
                        scheme + "\\" + choiceName;
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(path))
                    {
                        if (key == null)
                        {
                            continue;
                        }

                        string progId = Convert.ToString(
                            key.GetValue("ProgId", null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                            CultureInfo.InvariantCulture);
                        if (string.IsNullOrWhiteSpace(progId))
                        {
                            using (RegistryKey nestedProgId = key.OpenSubKey("ProgId"))
                            {
                                if (nestedProgId != null)
                                {
                                    progId = Convert.ToString(
                                        nestedProgId.GetValue("ProgId", null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                                        CultureInfo.InvariantCulture);
                                }
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(progId) &&
                            HasUsableExternalAssociation(context, scheme))
                        {
                            throw new UserChoiceConflictException(
                                "A per-user " + scheme + " " + choiceName +
                                " selects a handler; the session fallback will not override it.");
                        }
                    }
                }
            }
        }

        private static bool HasUsableExternalAssociation(PortableContext context, string scheme)
        {
            uint outputLength = 32768;
            StringBuilder output = new StringBuilder((int)outputLength);
            uint result = AssocQueryString(
                AssociationQueryFlags,
                AssociationStringCommand,
                scheme,
                "open",
                output,
                ref outputLength);

            if (result == ErrorNoAssociationHResult)
            {
                return false;
            }

            if (result != 0)
            {
                throw new InvalidOperationException(
                    "Windows could not verify the effective " + scheme +
                    " handler while evaluating UserChoice (HRESULT 0x" +
                    result.ToString("X8", CultureInfo.InvariantCulture) + ").");
            }

            string effectiveCommand = output.ToString();
            if (string.IsNullOrWhiteSpace(effectiveCommand))
            {
                throw new InvalidOperationException(
                    "Windows reported an empty effective " + scheme + " handler command.");
            }

            return !string.Equals(
                effectiveCommand, context.HandlerCommand, StringComparison.OrdinalIgnoreCase);
        }

        private static void WaitForNoUserChoice(PortableContext context)
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            UserChoiceConflictException lastException = null;
            while (true)
            {
                try
                {
                    AssertNoUserChoice(context);
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

        private static SchemeState ReadInitialSchemeState(string scheme)
        {
            string path = SchemePath(scheme);
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(path))
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
                        "The per-user " + scheme + " protocol key is not an empty URL Protocol marker: HKCU\\" + path +
                        "; values=[" + FormatRegistryNames(valueNames) + "]; subkeys=[" +
                        FormatRegistryNames(subKeyNames) + "]");
                }

                return new SchemeState { Scheme = scheme, RootExisted = true };
            }
        }

        private static string FormatRegistryNames(string[] names)
        {
            string[] displayNames = new string[names.Length];
            for (int index = 0; index < names.Length; index++)
            {
                displayNames[index] = names[index].Length == 0 ? "(Default)" : names[index];
            }

            return string.Join(", ", displayNames);
        }

        private static bool IsRegistrationActive(UrlHandlerState state)
        {
            ValidateState(state);
            foreach (SchemeState schemeState in state.Schemes)
            {
                using (RegistryKey root = Registry.CurrentUser.OpenSubKey(SchemePath(schemeState.Scheme)))
                {
                    if (root == null || !HasMatchingOwner(root, state.SessionId) ||
                        !IsEmptyProtocolMarker(root) ||
                        !HasOnlyOwnedRootValues(root) ||
                        !IsOwnedTreeShapeSafe(root, state.HandlerCommand, true))
                    {
                        return false;
                    }
                }
            }

            return IsGhBrowserOverrideReady(state);
        }

        private static void AssertCanRestore(string scheme, string sessionId, string expectedCommand)
        {
            using (RegistryKey root = Registry.CurrentUser.OpenSubKey(SchemePath(scheme)))
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
                                valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture)))
                        {
                            throw new InvalidOperationException("The per-user " + scheme + " protocol marker changed; refusing to restore it.");
                        }
                    }
                    else if (string.Equals(valueName, OwnerValueName, StringComparison.OrdinalIgnoreCase))
                    {
                        hasOwner = string.Equals(Convert.ToString(root.GetValue(
                            valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture),
                            sessionId, StringComparison.Ordinal);
                        if (!hasOwner)
                        {
                            throw new InvalidOperationException("The temporary " + scheme + " handler ownership marker changed; refusing to overwrite it.");
                        }
                    }
                    else
                    {
                        throw new InvalidOperationException("The per-user " + scheme + " protocol key gained another value; refusing to restore it.");
                    }
                }

                string[] subKeys = root.GetSubKeyNames();
                if (subKeys.Length == 0)
                {
                    return;
                }

                if (!hasOwner || !IsOwnedTreeShapeSafe(root, expectedCommand, false))
                {
                    throw new InvalidOperationException("The per-user " + scheme + " protocol command changed; refusing to restore it.");
                }
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

                if (shellSubKeys.Length != 1 || !string.Equals(shellSubKeys[0], "open", StringComparison.OrdinalIgnoreCase))
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

                    if (openSubKeys.Length != 1 || !string.Equals(openSubKeys[0], "command", StringComparison.OrdinalIgnoreCase))
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
                                string.Empty, null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture),
                                expectedCommand, StringComparison.Ordinal);
                    }
                }
            }
        }

        private static void WriteRegistration(UrlHandlerState state)
        {
            ValidateState(state);
            foreach (SchemeState schemeState in state.Schemes)
            {
                string path = SchemePath(schemeState.Scheme);
                using (RegistryKey root = Registry.CurrentUser.CreateSubKey(path))
                {
                    if (root == null)
                    {
                        throw new InvalidOperationException("Could not create HKCU\\" + path);
                    }

                    if (!HasValue(root, "URL Protocol"))
                    {
                        root.SetValue("URL Protocol", string.Empty, RegistryValueKind.String);
                    }

                    root.SetValue(OwnerValueName, state.SessionId, RegistryValueKind.String);
                }

                using (RegistryKey command = Registry.CurrentUser.CreateSubKey(path + "\\shell\\open\\command"))
                {
                    if (command == null)
                    {
                        throw new InvalidOperationException("Could not create the temporary " + schemeState.Scheme + " command.");
                    }

                    command.SetValue(string.Empty, state.HandlerCommand, RegistryValueKind.String);
                }
            }

            EnsureGhBrowserOverride(state);
        }

        private static bool ShouldCreateGhBrowserOverride()
        {
            using (RegistryKey environment = Registry.CurrentUser.OpenSubKey("Environment"))
            {
                return environment == null ||
                    (!HasValue(environment, GhBrowserValueName) && !HasValue(environment, "BROWSER"));
            }
        }

        private static string CreateGhBrowserCommand(string brokerPath, string sessionId)
        {
            return "\"" + brokerPath.Replace(
                Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) +
                "\" gh-open " + sessionId;
        }

        private static string GetExpectedGhBrowserCommand(UrlHandlerState state)
        {
            if (state.SchemaVersion == 2)
            {
                return state.BrokerPath.Replace(
                    Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            }

            return state.GhBrowserCommand;
        }

        private static bool IsCurrentGhBrowserCommand(string expectedCommand)
        {
            using (RegistryKey environment = Registry.CurrentUser.OpenSubKey("Environment"))
            {
                return environment != null && HasValue(environment, GhBrowserValueName) &&
                    environment.GetValueKind(GhBrowserValueName) == RegistryValueKind.String &&
                    string.Equals(Convert.ToString(environment.GetValue(
                        GhBrowserValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                        CultureInfo.InvariantCulture), expectedCommand, StringComparison.Ordinal);
            }
        }

        private static bool IsGhBrowserOverrideExternallyReplaced(UrlHandlerState state)
        {
            if (!state.GhBrowserCreated)
            {
                return false;
            }

            using (RegistryKey environment = Registry.CurrentUser.OpenSubKey("Environment"))
            {
                return environment != null && HasValue(environment, GhBrowserValueName) &&
                    (environment.GetValueKind(GhBrowserValueName) != RegistryValueKind.String ||
                     !string.Equals(Convert.ToString(environment.GetValue(
                         GhBrowserValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                         CultureInfo.InvariantCulture), GetExpectedGhBrowserCommand(state),
                         StringComparison.Ordinal));
            }
        }

        private static bool IsGhBrowserOverrideReady(UrlHandlerState state)
        {
            if (!state.GhBrowserCreated)
            {
                return true;
            }

            return IsCurrentGhBrowserCommand(GetExpectedGhBrowserCommand(state));
        }

        private static void EnsureGhBrowserOverride(UrlHandlerState state)
        {
            if (!state.GhBrowserCreated)
            {
                return;
            }

            using (RegistryKey environment = Registry.CurrentUser.CreateSubKey("Environment"))
            {
                if (environment == null)
                {
                    throw new InvalidOperationException("Could not open HKCU\\Environment.");
                }

                if (HasValue(environment, GhBrowserValueName) && !IsGhBrowserOverrideReady(state))
                {
                    throw new InvalidOperationException("GH_BROWSER changed during the Firefox session; refusing to overwrite it.");
                }

                environment.SetValue(
                    GhBrowserValueName,
                    GetExpectedGhBrowserCommand(state),
                    RegistryValueKind.String);
            }

            NotifyEnvironmentChanged();
        }

        private static bool Cleanup(PortableContext context)
        {
            return ExecuteWithStateMutex<bool>(context, delegate()
            {
                return CleanupCore(context);
            });
        }

        private static bool CleanupCore(PortableContext context)
        {
            bool legacyShimComplete = RemoveLegacyOpenUrlShim(context);
            bool legacyRegistrationRemoved = CleanupLegacyPowerShellRegistrations(context);
            UrlHandlerState state = ReadState(context.StatePath);
            if (state == null)
            {
                bool orphanedAdapterRemoved = CleanupOrphanedProtectedProgIdAdapter(context);
                if (legacyRegistrationRemoved || orphanedAdapterRemoved)
                {
                    NotifyAssociationChanged();
                }

                return legacyShimComplete;
            }

            bool complete = CleanupState(context.StatePath, state);
            if (complete || legacyRegistrationRemoved)
            {
                NotifyAssociationChanged();
            }

            return complete && legacyShimComplete;
        }

        private static bool CleanupLegacyPowerShellRegistrations(PortableContext context)
        {
            bool removed = false;
            foreach (string scheme in Schemes)
            {
                string rootPath = SchemePath(scheme);
                string commandPath = rootPath + "\\shell\\open\\command";
                bool matchesLegacyCommand = false;
                using (RegistryKey command = Registry.CurrentUser.OpenSubKey(commandPath))
                {
                    if (command != null && command.SubKeyCount == 0)
                    {
                        string[] valueNames = command.GetValueNames();
                        matchesLegacyCommand = valueNames.Length == 1 && valueNames[0].Length == 0 &&
                            command.GetValueKind(string.Empty) == RegistryValueKind.String &&
                            string.Equals(Convert.ToString(command.GetValue(
                                string.Empty, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                                CultureInfo.InvariantCulture), context.LegacyHandlerCommand,
                                StringComparison.OrdinalIgnoreCase);
                    }
                }

                if (!matchesLegacyCommand)
                {
                    continue;
                }

                Registry.CurrentUser.DeleteSubKey(commandPath, false);
                DeleteRegistryKeyIfEmpty(rootPath + "\\shell\\open");
                DeleteRegistryKeyIfEmpty(rootPath + "\\shell");
                using (RegistryKey root = Registry.CurrentUser.OpenSubKey(rootPath, true))
                {
                    if (root != null)
                    {
                        root.DeleteValue(OwnerValueName, false);
                    }
                }

                removed = true;
            }

            return removed;
        }

        private static void EnsureLegacyOpenUrlShim(PortableContext context)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(context.LegacyShimPath));

            if (File.Exists(context.LegacyShimPath))
            {
                if (!HasExactLegacyShimContent(context.LegacyShimPath))
                {
                    throw new InvalidOperationException(
                        "Tools\\OpenUrl.ps1 already exists and is not owned by Firefox PortableBridge.");
                }

                if (!RemoveExactLegacyShimFile(context.LegacyShimTemporaryPath))
                {
                    throw new InvalidOperationException(
                        "The legacy OpenUrl compatibility shim temporary path is occupied by another file.");
                }

                return;
            }

            if (File.Exists(context.LegacyShimTemporaryPath) &&
                !RemoveExactLegacyShimFile(context.LegacyShimTemporaryPath))
            {
                throw new InvalidOperationException(
                    "The legacy OpenUrl compatibility shim temporary path is occupied by another file.");
            }

            try
            {
                File.WriteAllText(context.LegacyShimTemporaryPath, LegacyOpenUrlShimContent, new UTF8Encoding(false));
                File.Move(context.LegacyShimTemporaryPath, context.LegacyShimPath);
            }
            finally
            {
                RemoveExactLegacyShimFile(context.LegacyShimTemporaryPath);
            }
        }

        private static bool RemoveLegacyOpenUrlShim(PortableContext context)
        {
            bool mainComplete = RemoveExactLegacyShimFile(context.LegacyShimPath);
            bool temporaryComplete = RemoveExactLegacyShimFile(context.LegacyShimTemporaryPath);
            return mainComplete && temporaryComplete;
        }

        private static bool RemoveExactLegacyShimFile(string path)
        {
            if (!File.Exists(path))
            {
                return true;
            }

            if (!HasExactLegacyShimContent(path))
            {
                return false;
            }

            File.Delete(path);
            return true;
        }

        private static bool HasExactLegacyShimContent(string path)
        {
            try
            {
                return string.Equals(
                    File.ReadAllText(path, Encoding.UTF8), LegacyOpenUrlShimContent, StringComparison.Ordinal);
            }
            catch
            {
                return false;
            }
        }

        private static T ExecuteWithStateMutex<T>(PortableContext context, Func<T> action)
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
                        throw new TimeoutException("Timed out waiting for exclusive access to the URL handler session state.");
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

        private static bool CleanupState(string statePath, UrlHandlerState state)
        {
            ValidateState(state);
            bool cleanupComplete = CleanupGhBrowserOverride(state);
            if (state.SchemaVersion == 1)
            {
                cleanupComplete = CleanupLegacyProtectedProgIdAdapter(state) && cleanupComplete;
            }
            foreach (SchemeState schemeState in state.Schemes)
            {
                string path = SchemePath(schemeState.Scheme);
                using (RegistryKey root = Registry.CurrentUser.OpenSubKey(path, true))
                {
                    if (root == null)
                    {
                        continue;
                    }

                    bool hasOwner = HasMatchingOwner(root, state.SessionId);
                    if (!hasOwner)
                    {
                        if (IsUnownedEmptyProtocolRoot(root))
                        {
                            if (!schemeState.RootExisted)
                            {
                                root.DeleteValue("URL Protocol", false);
                            }
                        }
                        else
                        {
                            cleanupComplete = false;
                        }

                        continue;
                    }

                    if (!HasOnlyOwnedRootValues(root) || !IsOwnedTreeShapeSafe(root, state.HandlerCommand, false))
                    {
                        cleanupComplete = false;
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
                }

                if (!schemeState.RootExisted)
                {
                    DeleteRegistryKeyIfEmpty(path);
                }
            }

            if (cleanupComplete)
            {
                File.Delete(statePath);
            }

            return cleanupComplete;
        }

        private static bool CleanupGhBrowserOverride(UrlHandlerState state)
        {
            if (state.SchemaVersion == 1 || !state.GhBrowserCreated)
            {
                return true;
            }

            bool removed = false;
            using (RegistryKey environment = Registry.CurrentUser.OpenSubKey("Environment", true))
            {
                if (environment == null || !HasValue(environment, GhBrowserValueName))
                {
                    return true;
                }

                if (environment.GetValueKind(GhBrowserValueName) != RegistryValueKind.String ||
                    !string.Equals(Convert.ToString(environment.GetValue(
                        GhBrowserValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames),
                        CultureInfo.InvariantCulture), GetExpectedGhBrowserCommand(state),
                        StringComparison.Ordinal))
                {
                    return false;
                }

                environment.DeleteValue(GhBrowserValueName, false);
                removed = true;
            }

            if (removed)
            {
                NotifyEnvironmentChanged();
            }

            return true;
        }

        private static bool CleanupLegacyProtectedProgIdAdapter(UrlHandlerState state)
        {
            string path = ProgIdPath(LegacyProtectedFallbackProgId);
            using (RegistryKey root = Registry.CurrentUser.OpenSubKey(path, true))
            {
                if (root == null || !HasValue(root, OwnerValueName))
                {
                    return true;
                }

                if (!HasMatchingOwner(root, state.SessionId) ||
                    !HasOnlyOwnedRootValues(root) ||
                    !IsOwnedTreeShapeSafe(root, state.HandlerCommand, false))
                {
                    return false;
                }

                root.DeleteSubKeyTree("shell", false);
                root.DeleteValue(OwnerValueName, false);
                root.DeleteValue("URL Protocol", false);
            }

            DeleteRegistryKeyIfEmpty(path);
            return true;
        }

        private static bool CleanupOrphanedProtectedProgIdAdapter(PortableContext context)
        {
            string path = ProgIdPath(LegacyProtectedFallbackProgId);
            using (RegistryKey root = Registry.CurrentUser.OpenSubKey(path, true))
            {
                if (root == null || root.ValueCount != 2 ||
                    !HasOnlyOwnedRootValues(root) || !IsEmptyProtocolMarker(root) ||
                    root.GetValueKind(OwnerValueName) != RegistryValueKind.String ||
                    !IsOwnedTreeShapeSafe(root, context.HandlerCommand, true))
                {
                    return false;
                }

                string sessionId = Convert.ToString(root.GetValue(
                    OwnerValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture);
                Guid parsedSessionId;
                if (!Guid.TryParseExact(sessionId, "D", out parsedSessionId))
                {
                    return false;
                }

                root.DeleteSubKeyTree("shell", false);
                root.DeleteValue(OwnerValueName, false);
                root.DeleteValue("URL Protocol", false);
            }

            DeleteRegistryKeyIfEmpty(path);
            return true;
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

            if (root.ValueCount == 0)
            {
                return true;
            }

            return root.ValueCount == 1 && IsEmptyProtocolMarker(root);
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
                    OwnerValueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames), CultureInfo.InvariantCulture),
                    sessionId, StringComparison.Ordinal);
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
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(path))
            {
                if (key != null)
                {
                    empty = key.ValueCount == 0 && key.SubKeyCount == 0;
                }
            }

            if (empty)
            {
                Registry.CurrentUser.DeleteSubKey(path, false);
            }
        }

        private static UrlHandlerState ReadState(string statePath)
        {
            if (!File.Exists(statePath))
            {
                return null;
            }

            try
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(UrlHandlerState));
                using (FileStream stream = new FileStream(statePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    UrlHandlerState state = (UrlHandlerState)serializer.ReadObject(stream);
                    ValidateState(state);
                    return state;
                }
            }
            catch (Exception exception)
            {
                throw new InvalidOperationException("The temporary URL handler state is invalid: " + statePath, exception);
            }
        }

        private static void ValidateState(UrlHandlerState state)
        {
            if (state == null || state.SchemaVersion < 1 || state.SchemaVersion > 3 ||
                string.IsNullOrWhiteSpace(state.SessionId) ||
                string.IsNullOrWhiteSpace(state.RootPath) ||
                string.IsNullOrWhiteSpace(state.BrokerPath) ||
                string.IsNullOrWhiteSpace(state.HandlerCommand) ||
                state.Schemes == null || state.Schemes.Length != 2)
            {
                throw new InvalidOperationException("The temporary URL handler state is incomplete.");
            }

            Guid parsedSessionId;
            if (!Guid.TryParseExact(state.SessionId, "D", out parsedSessionId) ||
                (state.SchemaVersion == 3 &&
                 !string.Equals(state.GhBrowserCommand,
                     CreateGhBrowserCommand(state.BrokerPath, state.SessionId), StringComparison.Ordinal)))
            {
                throw new InvalidOperationException("The temporary URL handler session identity is invalid.");
            }

            HashSet<string> found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (SchemeState schemeState in state.Schemes)
            {
                if (schemeState == null ||
                    (!string.Equals(schemeState.Scheme, "http", StringComparison.OrdinalIgnoreCase) &&
                     !string.Equals(schemeState.Scheme, "https", StringComparison.OrdinalIgnoreCase)) ||
                    !found.Add(schemeState.Scheme))
                {
                    throw new InvalidOperationException("The temporary URL handler scheme state is invalid.");
                }
            }
        }

        private static void WriteStateAtomic(string statePath, UrlHandlerState state)
        {
            string parent = Path.GetDirectoryName(statePath);
            Directory.CreateDirectory(parent);
            string temporaryPath = Path.Combine(parent, "." + Path.GetFileName(statePath) + "." + Guid.NewGuid().ToString("N") + ".tmp");
            string backupPath = temporaryPath + ".backup";
            try
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(UrlHandlerState));
                using (FileStream stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    serializer.WriteObject(stream, state);
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

        private static void RunPortableCleanup(PortableContext context)
        {
            string scriptPath = Path.Combine(context.RootPath, "Tools", "Portable.ps1");
            if (!File.Exists(scriptPath))
            {
                return;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                    "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
                Arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " +
                    QuoteArgument(scriptPath) + " -Root " + QuoteArgument(context.RootPath) + " -Mode Cleanup",
                WorkingDirectory = context.RootPath,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using (Process process = Process.Start(startInfo))
            {
                if (process != null)
                {
                    process.WaitForExit(60000);
                }
            }
        }

        private static string SchemePath(string scheme)
        {
            return "Software\\Classes\\" + scheme;
        }

        private static string ProgIdPath(string progId)
        {
            return "Software\\Classes\\" + progId;
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
                new IntPtr(0xffff),
                WmSettingChange,
                UIntPtr.Zero,
                "Environment",
                SmtoAbortIfHung,
                5000,
                out result);
        }

        private static string NormalizePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("A path is required.", "path");
            }

            return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }

        private static bool SamePath(string first, string second)
        {
            if (string.IsNullOrWhiteSpace(first) || string.IsNullOrWhiteSpace(second))
            {
                return false;
            }

            return string.Equals(NormalizePath(first), NormalizePath(second), StringComparison.OrdinalIgnoreCase);
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

        private static string QuoteArgument(string argument)
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

        private static void WriteError(PortableContext context, Exception exception)
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
            PortableContext context, Uri url, string channel, int result, Exception previousException)
        {
            try
            {
                Directory.CreateDirectory(context.DataPath);
                string authority = url.Scheme + "://" + url.DnsSafeHost;
                if (!url.IsDefaultPort)
                {
                    authority += ":" + url.Port.ToString(CultureInfo.InvariantCulture);
                }

                string previousFailure = previousException == null
                    ? "none"
                    : previousException.GetType().Name;
                string text = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) +
                    " caller=" + GetParentProcessName() +
                    " target=" + authority +
                    " channel=" + channel +
                    " result=" + result.ToString(CultureInfo.InvariantCulture) +
                    " previousFailure=" + previousFailure + Environment.NewLine;
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
                        {
                            int parentProcessId = Convert.ToInt32(
                                process["ParentProcessId"], CultureInfo.InvariantCulture);
                            using (Process parent = Process.GetProcessById(parentProcessId))
                            {
                                return parent.ProcessName;
                            }
                        }
                    }
                }
            }
            catch
            {
            }

            return "unknown";
        }

        private static void DeleteErrorLog(PortableContext context)
        {
            try
            {
                File.Delete(context.ErrorPath);
            }
            catch
            {
            }
        }

        private static void TryWriteError(Exception exception)
        {
            try
            {
                WriteError(CreateContext(GetRootFromBridgePath()), exception);
            }
            catch
            {
            }
        }
    }
}
