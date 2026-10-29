/** LaTeX 仅预留契约；未来编辑器、预览与编译器实现可独立替换。 */
export interface LatexProject { id: string; name: string; mainFile: string; files: { path: string; content: string }[] }
export interface LatexDiagnostic { file: string; line?: number; severity: 'error' | 'warning'; message: string }
export interface LatexCompiler {
  id: string;
  compile(project: LatexProject, signal?: AbortSignal): Promise<{ pdf: Uint8Array | null; diagnostics: LatexDiagnostic[] }>;
}
