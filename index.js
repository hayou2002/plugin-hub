export default class PluginHubPlugin {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async onload() {
    this.ctx?.log?.info?.("[PluginHub] loaded");
  }

  async onunload() {
    this.ctx?.log?.info?.("[PluginHub] unloaded");
  }
}
