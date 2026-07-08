/**
 * tools/install-patch.js — AI 智能安装补丁
 * 用户说"安装补丁"时，agent 自动执行 findAppAsar → extract → patch → pack 全流程
 */
import { installEnhancementPatch, uninstallEnhancementPatch, readPatchStatus } from "../routes/patcher.js";

export const name = "install-patch";
export const description = "安装 HanaAgent 增强补丁（抽屉下拉增强）。自动查找 app.asar 路径、解压、打补丁、重新打包，无需手动操作。安装后需要重启 Hana 生效。";
export const parameters = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["install", "uninstall", "status"],
      description: "操作类型：install 安装补丁，uninstall 卸载补丁，status 查看当前状态。默认 install"
    }
  },
  required: []
};

export const sessionPermission = {
  kind: "external_side_effect",
  description: "修改 app.asar 文件（HanaAgent 核心资源包），需要重启生效"
};

export async function execute(params, toolCtx) {
  const action = params?.action || "status";
  const ctx = toolCtx?.plugin || toolCtx;

  try {
    if (action === "status") {
      const status = readPatchStatus(ctx);
      return {
        installed: status.installed,
        appAsar: status.appAsar,
        inconsistent: status.inconsistent,
        error: status.error,
        note: status.installed
          ? "增强补丁已安装，如需卸载请执行 action=uninstall"
          : "增强补丁未安装，执行 action=install 可安装"
      };
    }

    if (action === "uninstall") {
      const result = uninstallEnhancementPatch(ctx);
      return {
        ...result,
        note: result.ok ? "补丁已卸载，请重启 Hana 生效" : "卸载失败: " + (result.error || "未知错误")
      };
    }

    // install
    const result = installEnhancementPatch(ctx);
    return {
      ...result,
      note: result.ok
        ? (result.alreadyPatched
          ? "补丁已安装，无需重复操作"
          : "补丁安装成功，请重启 Hana 生效。原始文件已备份到: " + (result.backup || "未知"))
        : "安装失败: " + (result.error || "未知错误")
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      note: "补丁操作失败: " + e.message
    };
  }
}