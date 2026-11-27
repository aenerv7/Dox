import {FluentProvider} from "@fluentui/react-components";
import {StrictMode} from "react";
import {createRoot} from "react-dom/client";

import {App} from "./popup/App";
import {useThemePreference} from "./popup/useThemePreference";
import "./index.css";

function PopupRoot() {
  const { theme, themePreference, setThemePreference } = useThemePreference();

  return (
    <FluentProvider className="gd4b-provider" theme={theme}>
      <App
        themePreference={themePreference}
        onThemePreferenceChange={(nextPreference) => void setThemePreference(nextPreference)}
      />
    </FluentProvider>
  );
}

document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = chrome.i18n.getMessage("extensionName");

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <PopupRoot />
  </StrictMode>,
);
