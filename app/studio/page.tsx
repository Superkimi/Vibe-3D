import type { Metadata } from "next";
import { ModelingStudio } from "@/components/editor/ModelingStudio";

export const metadata: Metadata = {
  title: "在线 3D 建模工作台",
  description: "通过参数与 AI 对话创建、编辑、预览并导出 3D 模型。",
};

export default function StudioPage() {
  return <ModelingStudio />;
}
