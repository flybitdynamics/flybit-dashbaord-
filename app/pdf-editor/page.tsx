import { PdfEditor } from "../components/pdf-editor/PdfEditor";

export const metadata = { title: "PDF Editor — FlyBit" };

/** Opens any PDF in the browser to change its text, move things, add text,
 *  images, highlights and signatures, and rearrange pages. Nothing is uploaded. */
export default function PdfEditorPage() {
  return <PdfEditor />;
}
