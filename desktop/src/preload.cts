import { contextBridge, ipcRenderer } from "electron";

/** The only desktop features the web app can reach; see types/beeblio-desktop.d.ts. */
contextBridge.exposeInMainWorld("beeblioDesktop", {
  platform: process.platform,
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke("beeblio:select-folder"),
});
