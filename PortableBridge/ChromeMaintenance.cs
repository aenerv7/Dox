using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Runtime.Serialization;
using System.Security.Principal;
using Microsoft.Win32;

namespace PortableBrowserBridge
{
    [DataContract]
    internal sealed class ChromeRegistryKeyBaseline
    {
        [DataMember(Order = 1)] public string Path;
        [DataMember(Order = 2)] public string[] Values;
    }

    [DataContract]
    internal sealed class ChromeRegistryViewBaseline
    {
        [DataMember(Order = 1)] public int View;
        [DataMember(Order = 2)] public bool RootExisted;
        [DataMember(Order = 3)] public bool GoogleExisted;
        [DataMember(Order = 4)] public bool UsageStatsExisted;
        [DataMember(Order = 5)] public ChromeRegistryKeyBaseline[] Keys;
    }

    [DataContract]
    internal sealed class ChromeRegistryBaseline
    {
        [DataMember(Order = 1)] public int Version = 1;
        [DataMember(Order = 2)] public string CohortId;
        [DataMember(Order = 3)] public string Root;
        [DataMember(Order = 4)] public bool Unsafe;
        [DataMember(Order = 5)] public ChromeRegistryViewBaseline[] Views;
    }

    // Deliberately excludes HKLM, Google Update, NativeMessagingHosts, Classes,
    // OpenWith, and user data. This is an exit cleanup, not registry virtualization.
    internal static class ChromeMaintenance
    {
        private static readonly string[] Roots = {
            @"Software\Google\Chrome", @"Software\Google\Chrome Beta",
            @"Software\Google\Chrome Dev", @"Software\Google\Chrome SxS",
            @"Software\Google\Chrome for Testing", @"Software\Chromium"
        };
        private static readonly string[] Trees = {
            "BLBeacon", "PreferenceMACs", "StabilityMetrics", "ThirdParty"
        };
        private const int MaxKeys = 8192;
        private const int MaxValues = 65536;

        internal static string IdentifyRoot(string executable)
        {
            // Never infer a Google product just from an arbitrary chrome.exe name.
            FileVersionInfo info = FileVersionInfo.GetVersionInfo(executable);
            if (info.ProductName == "Chromium") return Roots[5];
            if (info.ProductName == "Google Chrome for Testing") return Roots[4];
            if (info.ProductName != "Google Chrome" || info.CompanyName != "Google LLC") return null;
            string directory = Path.GetDirectoryName(executable);
            if (string.Equals(Path.GetFileName(directory), "Application", StringComparison.OrdinalIgnoreCase))
            {
                string product = Path.GetFileName(Path.GetDirectoryName(directory));
                if (string.Equals(product, "Chrome SxS", StringComparison.OrdinalIgnoreCase)) return Roots[3];
                if (string.Equals(product, "Chrome Dev", StringComparison.OrdinalIgnoreCase)) return Roots[2];
                if (string.Equals(product, "Chrome Beta", StringComparison.OrdinalIgnoreCase)) return Roots[1];
            }
            return Roots[0];
        }

        internal static ChromeRegistryBaseline Capture(SessionState state, List<SessionState> sessions)
        {
            string root = IdentifyRoot(state.BrowserPath);
            if (root == null) return null; // Unknown/legacy binary: no destructive assumptions.
            foreach (SessionState other in sessions)
            {
                if (other.ChromeRegistry != null &&
                    string.Equals(other.ChromeRegistry.Root, root, StringComparison.OrdinalIgnoreCase))
                    return other.ChromeRegistry; // First baseline survives every overlapping session.
            }
            ChromeRegistryBaseline baseline = new ChromeRegistryBaseline {
                CohortId = Guid.NewGuid().ToString("D"), Root = root,
                // The new browser must not be running before its baseline is taken.
                Unsafe = HasUntrackedChrome(sessions),
                Views = new ChromeRegistryViewBaseline[2]
            };
            RegistryView[] views = { RegistryView.Registry64, RegistryView.Registry32 };
            for (int index = 0; index < views.Length; index++)
                using (RegistryKey user = OpenUser(views[index], false))
                    baseline.Views[index] = CaptureView(user, root, (int)views[index]);
            Validate(baseline);
            return baseline;
        }

        internal static bool Observe(List<SessionState> sessions)
        {
            bool needed = sessions.Exists(delegate(SessionState state) {
                return state.ChromeRegistry != null && !state.ChromeRegistry.Unsafe;
            });
            if (!needed || !HasUntrackedChrome(sessions)) return false;
            bool changed = false;
            foreach (SessionState state in sessions)
                if (state.ChromeRegistry != null && !state.ChromeRegistry.Unsafe)
                {
                    state.ChromeRegistry.Unsafe = true;
                    changed = true;
                }
            return changed;
        }

        internal static void Cleanup(SessionState state, List<SessionState> sessions)
        {
            ChromeRegistryBaseline baseline = state.ChromeRegistry;
            if (baseline == null) return; // Older schema-2 session has no baseline.
            Validate(baseline);
            foreach (SessionState other in sessions)
                if (other.SessionId != state.SessionId && other.ChromeRegistry != null &&
                    other.ChromeRegistry.CohortId == baseline.CohortId)
                    return; // The last cohort member performs shared cleanup.
            if (baseline.Unsafe) return; // Preserve ambiguous data, do not retry destructively.
            if (HasUntrackedChrome(sessions)) throw new IOException("Chrome registry cleanup deferred: untracked or unknown Chrome process.");
            // Even a tracked late child can still write these shared keys.
            if (AnyChromeProcess()) throw new IOException("Chrome registry cleanup deferred until Chrome helper processes exit.");
            foreach (ChromeRegistryViewBaseline view in baseline.Views)
                using (RegistryKey user = OpenUser((RegistryView)view.View, true))
                    CleanupView(user, baseline.Root, view);
        }

        private static bool AnyChromeProcess()
        {
            using (ManagementObjectSearcher search = new ManagementObjectSearcher(
                "SELECT ProcessId FROM Win32_Process WHERE Name='chrome.exe'"))
            using (ManagementObjectCollection processes = search.Get())
                return processes.Count != 0;
        }

        internal static bool HasUntrackedChrome(List<SessionState> sessions)
        {
            try
            {
                using (ManagementObjectSearcher search = new ManagementObjectSearcher(
                    "SELECT ExecutablePath, CommandLine FROM Win32_Process WHERE Name='chrome.exe'"))
                using (ManagementObjectCollection processes = search.Get())
                foreach (ManagementObject process in processes)
                using (process)
                {
                    string path = Convert.ToString(process["ExecutablePath"]);
                    string command = Convert.ToString(process["CommandLine"]);
                    if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(command)) return true;
                    bool matched = false;
                    foreach (SessionState state in sessions)
                    {
                        if (state.Browser != BrowserSupport.Chrome || !PortableLayout.SamePath(path, state.BrowserPath)) continue;
                        string[] args = Program.ParseCommandLine(command);
                        bool child = Array.Exists(args, delegate(string arg) {
                            return arg == "--type" || arg.StartsWith("--type=", StringComparison.OrdinalIgnoreCase);
                        });
                        // Ignore known executable's helpers for attribution; cleanup still waits for all of them.
                        if (child || BrowserSupport.MatchesCommandLine(command, state)) { matched = true; break; }
                    }
                    if (!matched) return true;
                }
                return false;
            }
            catch { return true; } // WMI unknown taints this cohort permanently.
        }

        private static RegistryKey OpenUser(RegistryView view, bool writable)
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            using (RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, view))
            {
                if (identity.User == null) throw new InvalidOperationException("Missing user SID.");
                RegistryKey user = users.OpenSubKey(identity.User.Value, writable);
                if (user == null) throw new IOException("Cannot open current user's registry hive.");
                return user;
            }
        }

        internal static ChromeRegistryViewBaseline CaptureView(RegistryKey user, string root, int view)
        {
            RequireRoot(root);
            ChromeRegistryViewBaseline result = new ChromeRegistryViewBaseline { View = view };
            using (RegistryKey key = user.OpenSubKey(root))
            {
                result.RootExisted = key != null;
                result.UsageStatsExisted = key != null && HasValue(key, "UsageStatsInSample");
            }
            using (RegistryKey google = user.OpenSubKey(@"Software\Google")) result.GoogleExisted = google != null;
            List<ChromeRegistryKeyBaseline> keys = new List<ChromeRegistryKeyBaseline>();
            foreach (string tree in Trees) CaptureTree(user, root + "\\" + tree, tree, keys, 0);
            result.Keys = keys.ToArray();
            ValidateView(result);
            return result;
        }

        private static void CaptureTree(RegistryKey user, string absolute, string relative,
            List<ChromeRegistryKeyBaseline> keys, int depth)
        {
            if (depth > 32 || keys.Count >= MaxKeys) throw new InvalidDataException("Chrome baseline is too large.");
            using (RegistryKey key = user.OpenSubKey(absolute))
            {
                if (key == null) return;
                keys.Add(new ChromeRegistryKeyBaseline { Path = relative, Values = key.GetValueNames() });
                foreach (string child in key.GetSubKeyNames())
                    CaptureTree(user, absolute + "\\" + child, relative + "\\" + child, keys, depth + 1);
            }
        }

        internal static void CleanupView(RegistryKey user, string root, ChromeRegistryViewBaseline baseline)
        {
            RequireRoot(root);
            ValidateView(baseline);
            Dictionary<string, HashSet<string>> known = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            foreach (ChromeRegistryKeyBaseline key in baseline.Keys)
                known.Add(key.Path, new HashSet<string>(key.Values, StringComparer.OrdinalIgnoreCase));
            // Complete a bounded enumeration before making any changes.
            ChromeRegistryViewBaseline current = CaptureView(user, root, baseline.View);
            foreach (ChromeRegistryKeyBaseline key in current.Keys)
            {
                HashSet<string> values;
                known.TryGetValue(key.Path, out values);
                using (RegistryKey writable = user.OpenSubKey(root + "\\" + key.Path, true))
                {
                    if (writable == null) continue;
                    foreach (string value in key.Values)
                        if (values == null || !values.Contains(value)) writable.DeleteValue(value, false);
                }
            }
            for (int index = current.Keys.Length - 1; index >= 0; index--)
                if (!known.ContainsKey(current.Keys[index].Path))
                    DeleteEmpty(user, root + "\\" + current.Keys[index].Path);
            if (!baseline.UsageStatsExisted)
                using (RegistryKey key = user.OpenSubKey(root, true))
                    if (key != null) key.DeleteValue("UsageStatsInSample", false);
            if (!baseline.RootExisted) DeleteEmpty(user, root);
            if (!baseline.GoogleExisted && root.StartsWith(@"Software\Google\", StringComparison.Ordinal))
                DeleteEmpty(user, @"Software\Google");
        }

        private static void DeleteEmpty(RegistryKey user, string path)
        {
            using (RegistryKey key = user.OpenSubKey(path))
                if (key == null || key.SubKeyCount != 0 || key.ValueCount != 0) return;
            user.DeleteSubKey(path, false); // Never DeleteSubKeyTree; refuse nonempty concurrent additions.
        }

        private static bool HasValue(RegistryKey key, string name)
        {
            return Array.Exists(key.GetValueNames(), delegate(string value) {
                return string.Equals(value, name, StringComparison.OrdinalIgnoreCase);
            });
        }

        private static void RequireRoot(string root)
        {
            if (Array.IndexOf(Roots, root) < 0) throw new InvalidDataException("Unsupported Chrome registry root.");
        }

        internal static void Validate(ChromeRegistryBaseline baseline)
        {
            if (baseline == null) return;
            Guid id;
            if (baseline.Version != 1 || !Guid.TryParseExact(baseline.CohortId, "D", out id) ||
                baseline.Views == null || baseline.Views.Length != 2)
                throw new InvalidDataException("Invalid Chrome registry baseline.");
            RequireRoot(baseline.Root);
            HashSet<int> views = new HashSet<int>();
            foreach (ChromeRegistryViewBaseline view in baseline.Views)
            {
                ValidateView(view);
                if ((!view.RootExisted && (view.UsageStatsExisted || view.Keys.Length != 0)) ||
                    (baseline.Root.StartsWith(@"Software\Google\", StringComparison.Ordinal) && view.RootExisted && !view.GoogleExisted))
                    throw new InvalidDataException("Inconsistent Chrome baseline existence markers.");
                if (!views.Add(view.View)) throw new InvalidDataException("Duplicate registry view.");
            }
        }

        internal static bool SameBaseline(ChromeRegistryBaseline first, ChromeRegistryBaseline second)
        {
            if (first.Root != second.Root || first.CohortId != second.CohortId || first.Unsafe != second.Unsafe) return false;
            foreach (ChromeRegistryViewBaseline a in first.Views)
            {
                ChromeRegistryViewBaseline b = Array.Find(second.Views, delegate(ChromeRegistryViewBaseline view) { return view.View == a.View; });
                if (b == null || a.RootExisted != b.RootExisted || a.GoogleExisted != b.GoogleExisted ||
                    a.UsageStatsExisted != b.UsageStatsExisted || a.Keys.Length != b.Keys.Length) return false;
                Dictionary<string, ChromeRegistryKeyBaseline> keys = new Dictionary<string, ChromeRegistryKeyBaseline>(StringComparer.OrdinalIgnoreCase);
                foreach (ChromeRegistryKeyBaseline key in b.Keys) keys.Add(key.Path, key);
                foreach (ChromeRegistryKeyBaseline key in a.Keys)
                {
                    ChromeRegistryKeyBaseline other;
                    if (!keys.TryGetValue(key.Path, out other) ||
                        !new HashSet<string>(key.Values, StringComparer.OrdinalIgnoreCase).SetEquals(other.Values)) return false;
                }
            }
            return true;
        }

        private static void ValidateView(ChromeRegistryViewBaseline view)
        {
            if (view == null || (view.View != (int)RegistryView.Registry64 && view.View != (int)RegistryView.Registry32) ||
                view.Keys == null || view.Keys.Length > MaxKeys) throw new InvalidDataException("Invalid Chrome baseline view.");
            HashSet<string> paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            int values = 0;
            foreach (ChromeRegistryKeyBaseline key in view.Keys)
            {
                if (key == null || key.Values == null || string.IsNullOrEmpty(key.Path) ||
                    key.Path.Length > 4096 || !paths.Add(key.Path)) throw new InvalidDataException("Invalid Chrome baseline key.");
                string[] parts = key.Path.Split('\\');
                if (Array.IndexOf(Trees, parts[0]) < 0 || parts.Length > 33)
                    throw new InvalidDataException("Chrome baseline path is outside the allowlist.");
                foreach (string part in parts)
                    if (part.Length == 0 || part == "." || part == ".." || part.IndexOfAny(new[] { '/', '\0' }) >= 0)
                        throw new InvalidDataException("Invalid Chrome baseline path segment.");
                foreach (string value in key.Values)
                    if (value == null || value.IndexOf('\0') >= 0) throw new InvalidDataException("Invalid baseline value name.");
                values += key.Values.Length;
                if (values > MaxValues) throw new InvalidDataException("Chrome baseline has too many values.");
            }
        }
    }
}
