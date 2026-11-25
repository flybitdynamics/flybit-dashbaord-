import { PdfEditor } from "../components/pdf-editor/PdfEditor";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "PDF Editor — FlyBit" };

/** Opens any PDF in the browser to change its text, move things, add text,
 *  images, highlights and signatures, and rearrange pages. Nothing is uploaded. */
export default function PdfEditorPage() {
  return (
    <RequireAccess module="pdfEditor">
      <PdfEditor />
    </RequireAccess>
  );
}
