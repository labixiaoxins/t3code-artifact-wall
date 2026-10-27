import { useState } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import { UsersRoundIcon } from "lucide-react";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogHeader,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";

export function CouncilRequestAction({
  providers,
  disabled,
  onRequest,
}: {
  providers: readonly ServerProvider[];
  disabled: boolean;
  onRequest: () => void;
}) {
  const [open, setOpen] = useState(false);
  const choices = [
    { name: "GPT", driver: "codex" },
    { name: "Gemini Flash", driver: "antigravity" },
    { name: "Grok", driver: "grok" },
  ];
  return (
    <>
      <ComposerControl
        aria-label="发起三方会审"
        title="发起三方会审"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ComposerControlIcon icon={UsersRoundIcon} />
        <span data-composer-control-label>会审</span>
      </ComposerControl>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>发起三方会审</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-3 text-sm">
              <p>
                将当前输入作为审查目标，发送给当前助手，由它冻结必要材料并分别委派三方。当前任务模型与权限保持不变。
              </p>
              {choices.map((c) => {
                const provider = providers.find((p) => p.enabled && p.driver === c.driver);
                return (
                  <p key={c.driver}>
                    {c.name}：
                    {provider ? "已配置，启动时核对模型和额度" : "当前未配置，不会自动付费补齐"}
                  </p>
                );
              })}
              <p className="text-muted-foreground">
                材料范围先由助手核对；三方有模型消耗。未获授权的敏感材料或额外收费需先确认。进度和真实子任务显示在当前任务中，缺席与分歧单独列出；返回三份不等于通过。
              </p>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              onClick={() => {
                setOpen(false);
                onRequest();
              }}
              disabled={disabled}
            >
              发送会审请求
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
