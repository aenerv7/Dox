using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;
using System.Security.Principal;

namespace PortableBrowserBridge
{
    [DataContract]
    internal sealed class PortableStateSnapshot
    {
        [DataMember(Order = 1)] public int SchemaVersion;
        [DataMember(Order = 2)] public string RootPath;
        [DataMember(Order = 3)] public string AppPath;
        [DataMember(Order = 4)] public string ProfilePath;
        [DataMember(Order = 5)] public string UpdatedUtc;
    }

    [DataContract]
    internal sealed class PortableRuntimeBaseline
    {
        [DataMember(Order = 1)] public int SchemaVersion;
        [DataMember(Order = 2)] public string[] InstallerSubKeys;
        [DataMember(Order = 3)] public bool RoamingFirefoxExisted;
        [DataMember(Order = 4)] public bool LocalFirefoxExisted;
    }

    internal sealed class PortableLayout
    {
        internal string RootPath;
        internal string AppPath;
        internal string DataPath;
        internal string ProfilePath;
        internal string FirefoxPath;

        internal static PortableLayout FromAnnouncement(Announcement announcement)
        {
            string firefoxPath = NormalizePath(announcement.BrowserPath);
            string profilePath = NormalizePath(announcement.ProfilePath);
            string appPath = NormalizePath(Path.GetDirectoryName(firefoxPath));
            string dataPath = NormalizePath(Path.GetDirectoryName(profilePath));

            if (!string.Equals(Path.GetFileName(firefoxPath), "firefox.exe", StringComparison.OrdinalIgnoreCase) ||
                !Directory.Exists(profilePath) || !File.Exists(firefoxPath))
            {
                throw new InvalidOperationException("The announced Firefox executable and profile do not describe a portable layout.");
            }

            return new PortableLayout
            {
                RootPath = NormalizePath(Path.GetDirectoryName(dataPath)),
                AppPath = appPath,
                DataPath = dataPath,
                ProfilePath = profilePath,
                FirefoxPath = firefoxPath
            };
        }

        internal static PortableLayout FromState(SessionState state)
        {
            return FromAnnouncement(new Announcement
            {
                BrowserPath = state.BrowserPath,
                ProfilePath = state.ProfilePath
            });
        }

        internal static string NormalizePath(string path)
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

    }

    internal static class PortableMaintenance
    {
        private const int CurrentSchemaVersion = 1;
        private const string BaselineFileName = "runtime-baseline.json";
        internal static EnvironmentVariableState[] GetEnvironment(PortableLayout layout)
        {
            string crashRoot = Path.Combine(layout.DataPath, "crash-reports");
            string roaming = Path.Combine(layout.DataPath, "appdata", "roaming");
            string local = Path.Combine(layout.DataPath, "appdata", "local");
            return new[]
            {
                new EnvironmentVariableState { Name = "TEMP", Value = Path.Combine(layout.DataPath, "temp") },
                new EnvironmentVariableState { Name = "TMP", Value = Path.Combine(layout.DataPath, "temp") },
                new EnvironmentVariableState { Name = "MOZ_APP_DATA", Value = roaming },
                new EnvironmentVariableState { Name = "MOZ_LOCAL_APP_DATA", Value = local },
                new EnvironmentVariableState { Name = "MOZ_CRASHREPORTER_DISABLE", Value = "1" },
                new EnvironmentVariableState { Name = "MOZ_CRASHREPORTER_DATA_DIRECTORY", Value = Path.Combine(roaming, "Crash Reports") },
                new EnvironmentVariableState { Name = "MOZ_CRASHREPORTER_EVENTS_DIRECTORY", Value = Path.Combine(crashRoot, "events") },
                new EnvironmentVariableState { Name = "MOZ_CRASHREPORTER_PING_DIRECTORY", Value = Path.Combine(roaming, "Pending Pings") },
                new EnvironmentVariableState { Name = "CRASHES_EVENTS_DIR", Value = Path.Combine(crashRoot, "events") }
            };
        }

        internal static void PrepareAndRegister(PortableLayout layout)
        {
            Directory.CreateDirectory(layout.DataPath);
            Directory.CreateDirectory(layout.ProfilePath);
            RemoveExpiredMigrationBackups(layout.DataPath);

            PortableStateSnapshot previous = ReadPortableState(layout.DataPath);
            string previousRoot = previous == null ? null : Normalize(previous.RootPath);
            string previousApp = previous == null ? null : Normalize(previous.AppPath);
            string previousProfile = previous == null ? null : Normalize(previous.ProfilePath);
            string nssPath = GetNssProfilePath(Path.Combine(layout.ProfilePath, "pkcs11.txt"));
            if (previousProfile == null && !string.IsNullOrWhiteSpace(nssPath))
            {
                previousProfile = Normalize(nssPath);
                previousRoot = Normalize(Path.GetDirectoryName(Path.GetDirectoryName(previousProfile)));
                previousApp = Path.Combine(previousRoot, "App");
            }

            bool moved = previousRoot != null &&
                (!SamePath(previousRoot, layout.RootPath) || !SamePath(previousApp, layout.AppPath) ||
                 !SamePath(previousProfile, layout.ProfilePath));
            if (!string.IsNullOrWhiteSpace(nssPath) && !SamePath(nssPath, layout.ProfilePath))
            {
                moved = true;
            }

            string backupPath = moved
                ? CreateMigrationBackup(layout.DataPath)
                : Path.Combine(layout.DataPath, "migration-backups", "current");
            RepairNss(Path.Combine(layout.ProfilePath, "pkcs11.txt"), layout.ProfilePath, backupPath);
            RepairCompatibility(Path.Combine(layout.ProfilePath, "compatibility.ini"), layout.AppPath, backupPath);
            RepairExtensions(Path.Combine(layout.ProfilePath, "extensions.json"), previousRoot, previousProfile,
                layout.RootPath, layout.ProfilePath, backupPath);

            if (moved)
            {
                DeleteFile(Path.Combine(layout.ProfilePath, "addonStartup.json.lz4"));
                DeleteDirectory(Path.Combine(layout.ProfilePath, "startupCache"));
                DeleteDirectory(Path.Combine(layout.ProfilePath, "shader-cache"));
            }

            RemoveFirefoxRegistryFootprints(new[] { layout.FirefoxPath },
                previousApp == null ? new string[0] : new[] { Path.Combine(previousApp, "firefox.exe") }, layout.DataPath);
            SaveRuntimeBaseline(layout.DataPath);
            SetLauncherBlocklistOverride(layout);
            WritePortableState(layout);
        }

        internal static void Cleanup(SessionState state)
        {
            PortableLayout layout = PortableLayout.FromState(state);
            for (int attempt = 0; attempt < 20; attempt++)
            {
                RemoveFirefoxRegistryFootprints(new[] { layout.FirefoxPath }, new string[0], layout.DataPath);
                bool remains = HasLauncherBlocklistOverride(layout.FirefoxPath);
                if (!remains)
                {
                    return;
                }

                Thread.Sleep(500);
            }

            throw new IOException("The Firefox Launcher blocklist override could not be removed safely.");
        }

        internal static bool CleanupOrphanedLauncherOverrides()
        {
            const string path = "Software\\Mozilla\\Firefox\\Launcher";
            using (RegistryKey userRoot = OpenCurrentUserRoot(true))
            using (RegistryKey key = userRoot.OpenSubKey(path, true))
            {
                if (key == null) return true;
                foreach (string valueName in key.GetValueNames())
                {
                    if (!valueName.EndsWith("|Blocklist", StringComparison.OrdinalIgnoreCase)) continue;
                    string blocklist = Convert.ToString(key.GetValue(
                        valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                    if (!IsPortableBlocklistPath(blocklist)) continue;

                    if (!string.IsNullOrWhiteSpace(blocklist))
                    {
                        string full = Normalize(blocklist);
                        if (File.Exists(full)) File.Delete(full);
                    }
                    key.DeleteValue(valueName, false);
                }
            }

            DeleteRegistryKeyIfEmpty(path);
            return !HasOrphanedLauncherOverrides();
        }

        private static string Normalize(string path)
        {
            return PortableLayout.NormalizePath(path);
        }

        private static bool SamePath(string first, string second)
        {
            return PortableLayout.SamePath(first, second);
        }

        private static void RemoveExpiredMigrationBackups(string dataPath)
        {
            string backupRoot = Path.Combine(dataPath, "migration-backups");
            if (!Directory.Exists(backupRoot)) return;
            DateTime cutoff = DateTime.UtcNow.Subtract(TimeSpan.FromDays(1));
            foreach (string path in Directory.GetFileSystemEntries(backupRoot))
            {
                if (Directory.GetLastWriteTimeUtc(path) < cutoff)
                {
                    try
                    {
                        if (File.Exists(path)) File.Delete(path);
                        else if (Directory.Exists(path)) Directory.Delete(path, true);
                    }
                    catch { }
                }
            }
        }

        private static string CreateMigrationBackup(string dataPath)
        {
            string root = Path.Combine(dataPath, "migration-backups");
            Directory.CreateDirectory(root);
            string path = Path.Combine(root, DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(path);
            return path;
        }

        private static PortableStateSnapshot ReadPortableState(string dataPath)
        {
            string path = Path.Combine(dataPath, "portable-state.json");
            if (!File.Exists(path)) return null;
            try
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(PortableStateSnapshot));
                using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    PortableStateSnapshot state = (PortableStateSnapshot)serializer.ReadObject(stream);
                    if (state == null || state.SchemaVersion != CurrentSchemaVersion ||
                        string.IsNullOrWhiteSpace(state.RootPath) || string.IsNullOrWhiteSpace(state.AppPath) ||
                        string.IsNullOrWhiteSpace(state.ProfilePath)) throw new InvalidDataException();
                    return state;
                }
            }
            catch (Exception exception)
            {
                throw new InvalidOperationException("The portable location state is invalid: " + path, exception);
            }
        }

        private static void WritePortableState(PortableLayout layout)
        {
            string path = Path.Combine(layout.DataPath, "portable-state.json");
            PortableStateSnapshot state = new PortableStateSnapshot
            {
                SchemaVersion = CurrentSchemaVersion,
                RootPath = layout.RootPath,
                AppPath = layout.AppPath,
                ProfilePath = layout.ProfilePath,
                UpdatedUtc = DateTime.UtcNow.ToString("o")
            };
            WriteJsonAtomic(path, typeof(PortableStateSnapshot), state);
        }

        private static string GetNssProfilePath(string pkcsPath)
        {
            if (!File.Exists(pkcsPath)) return null;
            string content = File.ReadAllText(pkcsPath);
            Match match = Regex.Match(content, "(?m)^name=NSS Internal PKCS #11 Module\\r?\\nparameters=.*?\\bconfigdir='sql:(?<path>[^']*)'");
            return match.Success ? match.Groups["path"].Value.Replace("\\\\", "\\") : null;
        }

        private static void RepairNss(string path, string profilePath, string backupPath)
        {
            if (!File.Exists(path)) return;
            string content = File.ReadAllText(path);
            Match match = Regex.Match(content, "(?m)^(?<prefix>name=NSS Internal PKCS #11 Module\\r?\\nparameters=.*?\\bconfigdir='sql:)(?<path>[^']*)(?<suffix>'.*)$");
            if (!match.Success || SamePath(match.Groups["path"].Value.Replace("\\\\", "\\"), profilePath)) return;
            string updated = content.Substring(0, match.Index) + match.Groups["prefix"].Value + profilePath.Replace("\\", "\\\\") +
                match.Groups["suffix"].Value + content.Substring(match.Index + match.Length);
            BackupFile(path, backupPath);
            WriteTextAtomic(path, updated);
        }

        private static void RepairCompatibility(string path, string appPath, string backupPath)
        {
            if (!File.Exists(path)) return;
            string content = File.ReadAllText(path);
            string updated = Regex.Replace(content, "(?m)^LastPlatformDir=.*$", "LastPlatformDir=" + appPath);
            updated = Regex.Replace(updated, "(?m)^LastAppDir=.*$", "LastAppDir=" + Path.Combine(appPath, "browser"));
            if (string.Equals(updated, content, StringComparison.Ordinal)) return;
            BackupFile(path, backupPath);
            WriteTextAtomic(path, updated);
        }

        private static void RepairExtensions(string path, string oldRoot, string oldProfile, string newRoot,
            string newProfile, string backupPath)
        {
            if (!File.Exists(path) || (oldRoot == null && oldProfile == null)) return;
            string content = File.ReadAllText(path);
            string updated = content;
            if (oldRoot != null) updated = ReplacePathPrefix(updated, oldRoot, newRoot);
            if (oldProfile != null) updated = ReplacePathPrefix(updated, oldProfile, newProfile);
            if (string.Equals(updated, content, StringComparison.Ordinal)) return;
            BackupFile(path, backupPath);
            WriteTextAtomic(path, updated);
        }

        private static string ReplacePathPrefix(string text, string oldPath, string newPath)
        {
            string oldValue = oldPath.TrimEnd('\\', '/') + "\\";
            string newValue = newPath.TrimEnd('\\', '/') + "\\";
            string result = text.Replace(oldValue, newValue);
            result = result.Replace(oldValue.Replace("\\", "/"), newValue.Replace("\\", "/"));
            result = result.Replace(oldPath.Replace("\\", "\\\\"), newPath.Replace("\\", "\\\\"));
            result = result.Replace(new Uri(oldPath.TrimEnd('\\') + "\\").AbsoluteUri,
                new Uri(newPath.TrimEnd('\\') + "\\").AbsoluteUri);
            result = result.Replace(oldPath, newPath);
            return result;
        }

        private static void BackupFile(string path, string backupPath)
        {
            if (!File.Exists(path)) return;
            Directory.CreateDirectory(backupPath);
            string destination = Path.Combine(backupPath, Path.GetFileName(path));
            if (!File.Exists(destination)) File.Copy(path, destination);
        }

        private static void WriteTextAtomic(string path, string content)
        {
            string parent = Path.GetDirectoryName(path);
            Directory.CreateDirectory(parent);
            string temporary = Path.Combine(parent, "." + Path.GetFileName(path) + "." + Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                File.WriteAllText(temporary, content, new UTF8Encoding(false));
                if (File.Exists(path))
                {
                    string backup = temporary + ".backup";
                    File.Replace(temporary, path, backup, true);
                    if (File.Exists(backup)) File.Delete(backup);
                }
                else File.Move(temporary, path);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }

        private static void WriteJsonAtomic(string path, Type type, object value)
        {
            DataContractJsonSerializer serializer = new DataContractJsonSerializer(type);
            using (MemoryStream stream = new MemoryStream())
            {
                serializer.WriteObject(stream, value);
                WriteTextAtomic(path, Encoding.UTF8.GetString(stream.ToArray()));
            }
        }

        private static void DeleteFile(string path)
        {
            if (File.Exists(path)) File.Delete(path);
        }

        private static void DeleteDirectory(string path)
        {
            if (Directory.Exists(path)) Directory.Delete(path, true);
        }

        private static void SaveRuntimeBaseline(string dataPath)
        {
            string path = Path.Combine(dataPath, BaselineFileName);
            if (File.Exists(path)) return;
            string installer = "Software\\Mozilla\\Firefox\\Installer";
            string[] subKeys = new string[0];
            using (RegistryKey userRoot = OpenCurrentUserRoot(false))
            using (RegistryKey key = userRoot.OpenSubKey(installer))
            {
                if (key != null) subKeys = key.GetSubKeyNames();
            }
            PortableRuntimeBaseline baseline = new PortableRuntimeBaseline
            {
                SchemaVersion = CurrentSchemaVersion,
                InstallerSubKeys = subKeys,
                RoamingFirefoxExisted = Directory.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Mozilla\\Firefox")),
                LocalFirefoxExisted = Directory.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Mozilla\\Firefox"))
            };
            WriteJsonAtomic(path, typeof(PortableRuntimeBaseline), baseline);
        }

        private static void CompleteRuntimeBaselineCleanup(string dataPath)
        {
            string path = Path.Combine(dataPath, BaselineFileName);
            if (!File.Exists(path)) return;
            PortableRuntimeBaseline baseline;
            DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(PortableRuntimeBaseline));
            using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                baseline = (PortableRuntimeBaseline)serializer.ReadObject(stream);
            }
            if (baseline == null || baseline.SchemaVersion != CurrentSchemaVersion) throw new InvalidDataException("The runtime baseline schema is unsupported.");

            string installer = "Software\\Mozilla\\Firefox\\Installer";
            string[] current = new string[0];
            using (RegistryKey userRoot = OpenCurrentUserRoot(false))
            using (RegistryKey key = userRoot.OpenSubKey(installer))
            {
                if (key != null) current = key.GetSubKeyNames();
            }
            foreach (string subKey in current)
            {
                if (baseline.InstallerSubKeys != null && baseline.InstallerSubKeys.Contains(subKey, StringComparer.OrdinalIgnoreCase)) continue;
                DeleteRegistryKeyIfEmpty(installer + "\\" + subKey);
            }
            DeleteRegistryKeyIfEmpty(installer);

            DeleteNewFirefoxDirectory(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Mozilla\\Firefox"), baseline.RoamingFirefoxExisted);
            DeleteNewFirefoxDirectory(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Mozilla\\Firefox"), baseline.LocalFirefoxExisted);
            File.Delete(path);
        }

        private static void DeleteNewFirefoxDirectory(string path, bool existed)
        {
            if (existed || !Directory.Exists(path)) return;
            Directory.Delete(path, true);
            string parent = Path.GetDirectoryName(path);
            if (Directory.Exists(parent) && Directory.GetFileSystemEntries(parent).Length == 0) Directory.Delete(parent);
        }

        private static void SetLauncherBlocklistOverride(PortableLayout layout)
        {
            string cachePath = Path.Combine(layout.DataPath, "cache");
            Directory.CreateDirectory(cachePath);
            string blocklist = Path.Combine(cachePath, "firefox-dll-blocklist.json");
            using (RegistryKey userRoot = OpenCurrentUserRoot(true))
            using (RegistryKey key = userRoot.CreateSubKey("Software\\Mozilla\\Firefox\\Launcher"))
            {
                if (key == null) throw new InvalidOperationException("Could not open the Firefox launcher registry key.");
                key.SetValue(layout.FirefoxPath + "|Blocklist", blocklist, RegistryValueKind.String);
            }
        }

        private static void RemoveFirefoxRegistryFootprints(string[] executablePaths, string[] staleExecutablePaths, string dataPath)
        {
            RemoveLauncherBlocklistOverrides(executablePaths.Concat(staleExecutablePaths).ToArray());
            RemoveRegistryPathReferences(executablePaths.Concat(staleExecutablePaths).ToArray());
            RemoveToastRegistration(executablePaths);
            RemoveMuiCacheValues(executablePaths);
            RemoveFirefoxOpenWithEntries();
            RemoveFirefoxAudioPolicyEntries(executablePaths);
            RemoveCapabilityEntries(executablePaths, staleExecutablePaths);
            CompleteRuntimeBaselineCleanup(dataPath);
            DeleteRegistryKeyIfEmpty("Software\\Mozilla\\Firefox");
        }

        private static void RemoveLauncherBlocklistOverrides(string[] executablePaths)
        {
            const string path = "Software\\Mozilla\\Firefox\\Launcher";
            using (RegistryKey userRoot = OpenCurrentUserRoot(true))
            using (RegistryKey key = userRoot.OpenSubKey(path, true))
            {
                if (key == null) return;
                string defaultRoot = Normalize(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Mozilla\\Firefox"));
                HashSet<string> expectedNames = new HashSet<string>(
                    executablePaths.Select(exe => Normalize(exe) + "|Blocklist"), StringComparer.OrdinalIgnoreCase);
                foreach (string valueName in key.GetValueNames())
                {
                    string blocklist = Convert.ToString(key.GetValue(valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                    if (!expectedNames.Contains(valueName))
                    {
                        continue;
                    }

                    if (!string.IsNullOrWhiteSpace(blocklist))
                    {
                        string full = Normalize(blocklist);
                        if (full.StartsWith(defaultRoot + "\\", StringComparison.OrdinalIgnoreCase) &&
                            Path.GetFileName(full).StartsWith("blocklist-", StringComparison.OrdinalIgnoreCase) && File.Exists(full))
                        {
                            File.Delete(full);
                        }
                    }
                    key.DeleteValue(valueName, false);
                }
            }
            DeleteRegistryKeyIfEmpty(path);
        }

        private static bool HasLauncherBlocklistOverride(string firefoxPath)
        {
            using (RegistryKey userRoot = OpenCurrentUserRoot(false))
            using (RegistryKey key = userRoot.OpenSubKey("Software\\Mozilla\\Firefox\\Launcher"))
            {
                return key != null && key.GetValueNames().Any(name =>
                    string.Equals(name, Normalize(firefoxPath) + "|Blocklist", StringComparison.OrdinalIgnoreCase));
            }
        }

        private static bool HasOrphanedLauncherOverrides()
        {
            using (RegistryKey userRoot = OpenCurrentUserRoot(false))
            using (RegistryKey key = userRoot.OpenSubKey("Software\\Mozilla\\Firefox\\Launcher"))
            {
                return key != null && key.GetValueNames().Any(valueName =>
                {
                    if (!valueName.EndsWith("|Blocklist", StringComparison.OrdinalIgnoreCase)) return false;
                    string blocklist = Convert.ToString(key.GetValue(
                        valueName, null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                    return IsPortableBlocklistPath(blocklist);
                });
            }
        }

        private static bool IsPortableBlocklistPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return false;
            try
            {
                string normalized = Normalize(path);
                return string.Equals(Path.GetFileName(normalized), "firefox-dll-blocklist.json",
                        StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(Path.GetFileName(Path.GetDirectoryName(normalized)), "cache",
                        StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static void RemoveRegistryPathReferences(string[] executablePaths)
        {
            const string rootPath = "Software\\Mozilla\\Firefox";
            List<string> touched = new List<string>();
            using (RegistryKey userRoot = OpenCurrentUserRoot(true))
            using (RegistryKey root = userRoot.OpenSubKey(rootPath, true))
            {
                if (root == null) return;
                List<string> paths = new List<string> { rootPath };
                CollectSubKeys(root, rootPath, paths);
                foreach (string path in paths)
                {
                    using (RegistryKey key = userRoot.OpenSubKey(path, true))
                    {
                        if (key == null) continue;
                        foreach (string name in key.GetValueNames())
                        {
                            object value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                            string text = value is string[] ? string.Join("\n", (string[])value) : Convert.ToString(value);
                            if (ReferencesAnyPath(name, executablePaths) || ReferencesAnyPath(text, executablePaths))
                            {
                                key.DeleteValue(name, false);
                                touched.Add(path);
                            }
                        }
                    }
                }
            }
            foreach (string path in touched.OrderByDescending(value => value.Length).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!string.Equals(path, rootPath, StringComparison.OrdinalIgnoreCase)) DeleteRegistryKeyIfEmpty(path);
            }
            foreach (string path in new[] { rootPath + "\\Default Browser Agent", rootPath + "\\DllPrefetchExperiment", rootPath + "\\Launcher", rootPath + "\\PreXULSkeletonUISettings" })
            {
                DeleteRegistryKeyIfEmpty(path);
            }
        }

        private static void CollectSubKeys(RegistryKey key, string path, List<string> paths)
        {
            foreach (string name in key.GetSubKeyNames())
            {
                string child = path + "\\" + name;
                paths.Add(child);
                using (RegistryKey childKey = key.OpenSubKey(name))
                {
                    if (childKey != null) CollectSubKeys(childKey, child, paths);
                }
            }
        }

        private static bool ReferencesAnyPath(string text, string[] executablePaths)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            foreach (string exe in executablePaths)
            {
                string normalized = Normalize(exe);
                string app = Path.GetDirectoryName(normalized);
                string[] candidates = { normalized, app, normalized.Replace("\\", "/"), app.Replace("\\", "/") };
                foreach (string candidate in candidates)
                {
                    if (!string.IsNullOrWhiteSpace(candidate) && text.IndexOf(candidate, StringComparison.OrdinalIgnoreCase) >= 0) return true;
                }
            }
            return false;
        }

        private static void RemoveMuiCacheValues(string[] executablePaths)
        {
            const string path = "Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache";
            using (RegistryKey classesRoot = OpenCurrentUserClassesRoot(false))
            using (RegistryKey key = classesRoot.OpenSubKey(path, true))
            {
                if (key == null) return;
                foreach (string name in key.GetValueNames())
                {
                    foreach (string exe in executablePaths)
                    {
                        if (name.StartsWith(Normalize(exe) + ".", StringComparison.OrdinalIgnoreCase)) { key.DeleteValue(name, false); break; }
                    }
                }
            }
        }

        private static void RemoveFirefoxOpenWithEntries()
        {
            const string root = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts";
            using (RegistryKey userRoot = OpenCurrentUserRoot(false))
            using (RegistryKey rootKey = userRoot.OpenSubKey(root))
            {
                if (rootKey == null) return;
                foreach (string extension in rootKey.GetSubKeyNames())
                {
                    string path = root + "\\" + extension + "\\OpenWithList";
                    using (RegistryKey key = userRoot.OpenSubKey(path, true))
                    {
                        if (key == null) continue;
                        List<string> removed = new List<string>();
                        foreach (string name in key.GetValueNames())
                        {
                            if (string.Equals(name, "MRUList", StringComparison.OrdinalIgnoreCase)) continue;
                            string value = Convert.ToString(key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                            if (string.Equals(value, "firefox.exe", StringComparison.OrdinalIgnoreCase)) { key.DeleteValue(name, false); removed.Add(name); }
                        }
                        if (removed.Count > 0 && key.GetValueNames().Any(n => string.Equals(n, "MRUList", StringComparison.OrdinalIgnoreCase)))
                        {
                            string mru = Convert.ToString(key.GetValue("MRUList", "", RegistryValueOptions.DoNotExpandEnvironmentNames));
                            foreach (string name in removed) mru = mru.Replace(name, "");
                            if (string.IsNullOrEmpty(mru)) key.DeleteValue("MRUList", false); else key.SetValue("MRUList", mru, RegistryValueKind.String);
                        }
                    }
                    DeleteRegistryKeyIfEmpty(path);
                }
            }
        }

        private static void RemoveFirefoxAudioPolicyEntries(string[] executablePaths)
        {
            const string path = "Software\\Microsoft\\Internet Explorer\\LowRegistry\\Audio\\PolicyConfig\\PropertyStore";
            using (RegistryKey userRoot = OpenCurrentUserRoot(true))
            using (RegistryKey key = userRoot.OpenSubKey(path, true))
            {
                if (key == null) return;
                foreach (string name in key.GetSubKeyNames())
                {
                    string value;
                    using (RegistryKey child = key.OpenSubKey(name))
                    {
                        value = child == null ? null : Convert.ToString(child.GetValue("", null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                    }
                    if (ReferencesAnyPath(value, executablePaths)) key.DeleteSubKeyTree(name, false);
                }
            }
        }

        private static void RemoveToastRegistration(string[] executablePaths)
        {
            const string root = "AppUserModelId";
            List<string> owned = new List<string>();
            List<string> activators = new List<string>();
            using (RegistryKey classesRoot = OpenCurrentUserClassesRoot(false))
            using (RegistryKey key = classesRoot.OpenSubKey(root))
            {
                if (key == null) return;
                foreach (string name in key.GetSubKeyNames())
                {
                    if (!name.StartsWith("FirefoxPortableToast-", StringComparison.OrdinalIgnoreCase)) continue;
                    using (RegistryKey child = key.OpenSubKey(name))
                    {
                        string icon = child == null ? null : Convert.ToString(child.GetValue("IconUri", null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                        if (ReferencesAnyPath(icon, executablePaths))
                        {
                            owned.Add(name);
                            string activator = child == null ? null : Convert.ToString(child.GetValue("CustomActivator", null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                            if (!string.IsNullOrWhiteSpace(activator)) activators.Add(activator);
                        }
                    }
                }
            }
            foreach (string name in owned)
            {
                using (RegistryKey userRoot = OpenCurrentUserRoot(true))
                {
                    using (RegistryKey classesRoot = OpenCurrentUserClassesRoot(true))
                    {
                        classesRoot.DeleteSubKeyTree(root + "\\" + name, false);
                    }
                    userRoot.DeleteSubKeyTree("Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\" + name, false);
                    userRoot.DeleteSubKeyTree("Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications\\Backup\\" + name, false);
                }
            }
            foreach (string activator in activators.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                Guid ignored;
                if (!Guid.TryParse(activator.Trim('{', '}'), out ignored)) continue;
                string clsid = "CLSID\\" + activator;
                string inproc = clsid + "\\InprocServer32";
                string server;
                using (RegistryKey classesRoot = OpenCurrentUserClassesRoot(false))
                using (RegistryKey key = classesRoot.OpenSubKey(inproc))
                {
                    server = key == null ? null : Convert.ToString(key.GetValue("", null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                }
                if (string.Equals(Path.GetFileName(server), "notificationserver.dll", StringComparison.OrdinalIgnoreCase))
                {
                    using (RegistryKey classesRoot = OpenCurrentUserClassesRoot(true))
                    {
                        classesRoot.DeleteSubKeyTree(clsid, false);
                        classesRoot.DeleteSubKeyTree("AppID\\" + activator, false);
                    }
                }
            }
        }

        private static void RemoveCapabilityEntries(string[] executablePaths, string[] staleExecutablePaths)
        {
            const string root = "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore";
            using (RegistryKey userRoot = OpenCurrentUserRoot(true))
            using (RegistryKey consent = userRoot.OpenSubKey(root, true))
            {
                if (consent == null) return;
                foreach (string capability in consent.GetSubKeyNames())
                {
                    string nonPackaged = root + "\\" + capability + "\\NonPackaged";
                    using (RegistryKey entries = userRoot.OpenSubKey(nonPackaged, true))
                    {
                        if (entries == null) continue;
                        foreach (string encoded in entries.GetSubKeyNames())
                        {
                            bool stale = staleExecutablePaths.Any(exe => string.Equals(encoded,
                                Normalize(exe).Replace('\\', '#'), StringComparison.OrdinalIgnoreCase));
                            bool current = executablePaths.Any(exe => string.Equals(encoded,
                                Normalize(exe).Replace('\\', '#'), StringComparison.OrdinalIgnoreCase));
                            if (stale || (current && !HasValue(entries.OpenSubKey(encoded), "Value"))) entries.DeleteSubKeyTree(encoded, false);
                        }
                    }
                }
            }
        }

        private static bool HasValue(RegistryKey key, string name)
        {
            if (key == null) return false;
            using (key) { return key.GetValueNames().Any(valueName => string.Equals(valueName, name, StringComparison.OrdinalIgnoreCase)); }
        }

        private static void DeleteRegistryKeyIfEmpty(string path)
        {
            using (RegistryKey userRoot = OpenCurrentUserRoot(true))
            using (RegistryKey key = userRoot.OpenSubKey(path))
            {
                if (key == null || key.ValueCount != 0 || key.SubKeyCount != 0) return;
                userRoot.DeleteSubKey(path, false);
            }
        }

        private static RegistryKey OpenCurrentUserRoot(bool writable)
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (identity.User == null) throw new InvalidOperationException("The current Windows user SID is unavailable.");
                RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64);
                RegistryKey root = users.OpenSubKey(identity.User.Value, writable);
                users.Dispose();
                if (root == null) throw new InvalidOperationException("The current Windows user registry hive is unavailable.");
                return root;
            }
        }

        private static RegistryKey OpenCurrentUserClassesRoot(bool writable)
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (identity.User == null) throw new InvalidOperationException("The current Windows user SID is unavailable.");
                RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64);
                RegistryKey root = users.OpenSubKey(identity.User.Value + "_Classes", writable);
                users.Dispose();
                if (root == null) throw new InvalidOperationException("The current Windows user classes registry hive is unavailable.");
                return root;
            }
        }

    }
}
