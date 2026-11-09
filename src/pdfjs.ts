// pdf.js with its worker configured once. Import pdf.js from here, not from "pdfjs-dist".
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjs };
