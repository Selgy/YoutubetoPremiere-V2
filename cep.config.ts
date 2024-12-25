import { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

// Add custom type declaration to extend CEF_Command
declare module "vite-cep-plugin" {
  type CEF_Command = 
    | "--v=0"
    | "--enable-nodejs"
    | "--mixed-context"
    | "--allow-file-access"
    | "--allow-file-access-from-files"
    | "--allow-insecure-localhost";
}

const config: CEP_Config = {
  version,
  id: "com.YoutubetoPremiereV2.cep",
  displayName: "YoutubetoPremiere V2",
  symlink: "local",
  port: 4000,
  servePort: 6000,
  startingDebugPort: 8880,
  extensionManifestVersion: 6.0,
  requiredRuntimeVersion: 9.0,
  hosts: [
    { name: "PPRO", version: "[0.0,99.9]" }
  ],
  type: "Panel",
  iconDarkNormal: "./src/assets/light-icon.png",
  iconNormal: "./src/assets/dark-icon.png",
  iconDarkNormalRollOver: "./src/assets/light-icon.png",
  iconNormalRollOver: "./src/assets/dark-icon.png",
  parameters: [
    "--v=0",
    "--enable-nodejs",
    "--mixed-context",
    "--allow-file-access",
  ],
  width: 500,
  height: 550,

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: "YoutubetoPremiere",
      autoVisible: true,
      width: 400,
      height: 695,
      minWidth: 400,
      minHeight: 350,
      maxWidth: 1200,
      maxHeight: 800,
      type: "Modeless",
    },
    {
      mainPath: "./settings/index.html", 
      name: "settings", 
      autoVisible: false, 
      type: "Custom", 
      startOnEvents: ["com.adobe.csxs.events.ApplicationInitialized", "applicationActive"], 
      height: 1, 
    }
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    country: "FR",
    province: "CA",
    org: "Selgy",
    password: "test",
    tsa: "http://timestamp.digicert.com/",
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  copyAssets: [
    "./js",
    "./jsx",
    "./exec",
  ],
  copyZipAssets: [],
};

export default config;