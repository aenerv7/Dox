using System;
using System.IO;

namespace PortableBrowserBridge
{
    // 浏览器专有行为集中在这里；协议所有权和会话调度不依赖浏览器类型。
    internal static class BrowserSupport
    {
        internal const string Firefox = "firefox";
        internal const string Chrome = "chrome";

        internal static bool IsSupported(string browser)
        {
            return browser == Firefox || browser == Chrome;
        }

        internal static string ExecutableName(string browser)
        {
            if (!IsSupported(browser)) throw new InvalidOperationException("Unsupported browser.");
            return browser + ".exe";
        }

        internal static void Validate(Announcement announcement)
        {
            if (announcement == null || !IsSupported(announcement.Browser) ||
                !IsAbsolutePath(announcement.BrowserPath) || !File.Exists(announcement.BrowserPath) ||
                !string.Equals(Path.GetFileName(announcement.BrowserPath), ExecutableName(announcement.Browser),
                    StringComparison.OrdinalIgnoreCase) ||
                !IsAbsolutePath(announcement.ProfilePath) || !Directory.Exists(announcement.ProfilePath) ||
                !ValidProfileDirectory(announcement.Browser, announcement.ProfileDirectory))
                throw new InvalidOperationException("Invalid browser, executable, or profile path.");

            announcement.BrowserPath = PortableLayout.NormalizePath(announcement.BrowserPath);
            announcement.ProfilePath = PortableLayout.NormalizePath(announcement.ProfilePath);
            if (announcement.Browser == Firefox) PortableLayout.FromAnnouncement(announcement);
        }

        internal static bool IsAbsolutePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || path.IndexOfAny(Path.GetInvalidPathChars()) >= 0)
                return false;
            // 排除相对路径、当前盘根相对路径与 C:foo 形式。
            string root = Path.GetPathRoot(path);
            return !string.IsNullOrEmpty(root) &&
                (root.StartsWith(@"\\", StringComparison.Ordinal) ||
                 (root.Length == 3 && root[1] == ':' && (root[2] == '\\' || root[2] == '/')));
        }

        internal static bool ValidProfileDirectory(string browser, string directory)
        {
            if (string.IsNullOrEmpty(directory)) return true;
            return browser == Chrome && directory != "." && directory != ".." &&
                directory.IndexOfAny(Path.GetInvalidFileNameChars()) < 0 &&
                !directory.EndsWith(".", StringComparison.Ordinal) &&
                !directory.EndsWith(" ", StringComparison.Ordinal);
        }

        internal static EnvironmentVariableState[] GetEnvironment(Announcement announcement)
        {
            return announcement.Browser == Firefox
                ? PortableMaintenance.GetEnvironment(PortableLayout.FromAnnouncement(announcement))
                : new EnvironmentVariableState[0];
        }

        internal static void Prepare(Announcement announcement)
        {
            if (announcement.Browser == Firefox)
                PortableMaintenance.PrepareAndRegister(PortableLayout.FromAnnouncement(announcement));
        }

        internal static void Cleanup(SessionState state)
        {
            if (state.Browser == Firefox) PortableMaintenance.Cleanup(state);
        }

        internal static string CreateArguments(SessionState state, string url)
        {
            if (state.Browser == Firefox)
                return "--profile " + Program.QuoteArgument(state.ProfilePath) + " -url " + Program.QuoteArgument(url);
            if (state.Browser != Chrome) throw new InvalidOperationException("Unsupported browser.");
            return "--user-data-dir=" + Program.QuoteArgument(state.ProfilePath) +
                (string.IsNullOrEmpty(state.ProfileDirectory) ? string.Empty :
                 " --profile-directory=" + Program.QuoteArgument(state.ProfileDirectory)) +
                " " + Program.QuoteArgument(url);
        }

        internal static bool MatchesCommandLine(string commandLine, SessionState state)
        {
            string[] arguments = Program.ParseCommandLine(commandLine);
            string profilePath = null;
            string profileDirectory = null;
            for (int index = 1; index < arguments.Length; index++)
            {
                string argument = arguments[index];
                if (state.Browser == Firefox)
                {
                    if (argument.Equals("-contentproc", StringComparison.OrdinalIgnoreCase) ||
                        argument.Equals("-no-remote", StringComparison.OrdinalIgnoreCase) ||
                        argument.Equals("--no-remote", StringComparison.OrdinalIgnoreCase) ||
                        argument.Equals("-url", StringComparison.OrdinalIgnoreCase) ||
                        argument.Equals("--url", StringComparison.OrdinalIgnoreCase)) return false;
                    if (ReadOption(arguments, ref index, "--profile", out argument) ||
                        ReadOption(arguments, ref index, "-profile", out argument)) profilePath = argument;
                }
                else if (state.Browser == Chrome)
                {
                    // Chrome 的 renderer/GPU/utility 进程也可能携带用户数据路径。
                    if (argument.Equals("--type", StringComparison.OrdinalIgnoreCase) ||
                        argument.StartsWith("--type=", StringComparison.OrdinalIgnoreCase)) return false;
                    if (ReadOption(arguments, ref index, "--user-data-dir", out argument)) profilePath = argument;
                    else if (ReadOption(arguments, ref index, "--profile-directory", out argument)) profileDirectory = argument;
                }
                else return false;
            }
            return IsAbsolutePath(profilePath) && Program.SamePath(profilePath, state.ProfilePath) &&
                (state.Browser != Chrome || string.IsNullOrEmpty(state.ProfileDirectory) ||
                 string.Equals(profileDirectory, state.ProfileDirectory, StringComparison.OrdinalIgnoreCase));
        }

        private static bool ReadOption(string[] arguments, ref int index, string option, out string value)
        {
            value = null;
            if (arguments[index].StartsWith(option + "=", StringComparison.OrdinalIgnoreCase))
            {
                value = arguments[index].Substring(option.Length + 1);
                return true;
            }
            if (arguments[index].Equals(option, StringComparison.OrdinalIgnoreCase) && index + 1 < arguments.Length)
            {
                value = arguments[++index];
                return true;
            }
            return false;
        }
    }
}
