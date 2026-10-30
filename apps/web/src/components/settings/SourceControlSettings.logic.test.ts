import { expect, it } from "vite-plus/test";
import { sourceControlDetail } from "./SourceControlSettings.logic";

it("preserves external diagnostics and only interpolates the application fallback", () => {
  for (const detail of ["Settings", "GitLab: literal {0} / account $HOME", ""]) {
    expect(
      sourceControlDetail(detail, "Every {0} host is turned off.", { 0: "GitLab" }, "zh-CN"),
    ).toBe(detail);
  }
  expect(
    sourceControlDetail(null, "Support for {0} is coming soon.", { 0: "Jujutsu" }, "zh-CN"),
  ).toBe("即将支持 Jujutsu。");
  expect(sourceControlDetail(null, "Support for {0} is coming soon.", { 0: "Jujutsu" }, "en")).toBe(
    "Support for Jujutsu is coming soon.",
  );
});
