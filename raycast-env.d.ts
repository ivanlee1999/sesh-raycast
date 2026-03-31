/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Server URL - URL of your sesh-web server */
  "serverUrl": string,
  /** Default Focus Duration (minutes) - Default duration for quick-start focus sessions */
  "defaultDuration": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `menu-bar-timer` command */
  export type MenuBarTimer = ExtensionPreferences & {}
  /** Preferences accessible in the `view-timer` command */
  export type ViewTimer = ExtensionPreferences & {}
  /** Preferences accessible in the `start-focus` command */
  export type StartFocus = ExtensionPreferences & {}
  /** Preferences accessible in the `quick-start` command */
  export type QuickStart = ExtensionPreferences & {}
  /** Preferences accessible in the `pause-resume` command */
  export type PauseResume = ExtensionPreferences & {}
  /** Preferences accessible in the `finish-session` command */
  export type FinishSession = ExtensionPreferences & {}
  /** Preferences accessible in the `view-history` command */
  export type ViewHistory = ExtensionPreferences & {}
  /** Preferences accessible in the `view-analytics` command */
  export type ViewAnalytics = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `menu-bar-timer` command */
  export type MenuBarTimer = {}
  /** Arguments passed to the `view-timer` command */
  export type ViewTimer = {}
  /** Arguments passed to the `start-focus` command */
  export type StartFocus = {}
  /** Arguments passed to the `quick-start` command */
  export type QuickStart = {}
  /** Arguments passed to the `pause-resume` command */
  export type PauseResume = {}
  /** Arguments passed to the `finish-session` command */
  export type FinishSession = {}
  /** Arguments passed to the `view-history` command */
  export type ViewHistory = {}
  /** Arguments passed to the `view-analytics` command */
  export type ViewAnalytics = {}
}

