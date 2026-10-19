// pdfmake ships no types for its browser build; this is the part we call.
declare module 'pdfmake/build/pdfmake' {
  interface OutputDocument {
    getBlob(): Promise<Blob>;
    download(filename?: string): Promise<void>;
  }
  interface PdfMake {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    addFonts(fonts: Record<string, Record<'normal' | 'bold' | 'italics' | 'bolditalics', string>>): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
    createPdf(doc: unknown): OutputDocument;
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}
