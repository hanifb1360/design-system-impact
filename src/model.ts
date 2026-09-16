export type Severity = 'info' | 'warning' | 'error';
export interface SourceLocation { file: string; line: number; column: number }
export interface Diagnostic { code: `DSI${number}`; severity: Severity; message: string; location?: SourceLocation; related?: string[] }
export interface PropContract { required: boolean; type: string; literals?: string[]; deprecated?: string }
export interface ComponentContract { name: string; importPath: string; props: Record<string, PropContract>; deprecated?: string; source?: SourceLocation }
export interface TokenContract { name: string; kind: 'json' | 'css-custom-property'; value: unknown; alias?: string; source?: SourceLocation }
export interface ExportContract { name: string; importPath: string; kind: 'component' | 'symbol' }
export interface DesignSystemSnapshot {
  schemaVersion: 1; kind: 'design-system-snapshot'; package: { name: string; version?: string };
  generatedBy: { name: 'design-system-impact'; schemaVersion: 1 };
  components: Record<string, ComponentContract>; tokens: Record<string, TokenContract>;
  exports: ExportContract[]; diagnostics: Diagnostic[];
}
export type ChangeCategory = 'component' | 'component-prop' | 'export' | 'token';
export type ChangeType = 'added' | 'removed' | 'type-changed' | 'requiredness-changed' | 'union-expanded' | 'union-narrowed' | 'deprecated' | 'value-changed' | 'alias-changed' | 'path-changed';
export interface SemanticChange {
  id: string; category: ChangeCategory; changeType: ChangeType; severity: 'non-breaking' | 'potentially-breaking' | 'breaking';
  subject: { component?: string; property?: string; token?: string; export?: string };
  before?: unknown; after?: unknown; evidence: 'observed';
}
export interface SemanticDiff { schemaVersion: 1; kind: 'design-system-diff'; from: DesignSystemSnapshot['package']; to: DesignSystemSnapshot['package']; changes: SemanticChange[]; diagnostics: Diagnostic[] }
export interface MigrationHints { schemaVersion: 1; componentProps?: Record<string, Record<string, { replacedBy: string; values?: Record<string, string> }>>; tokens?: Record<string, { replacedBy: string }> }
export interface ImpactLocation extends SourceLocation { workspace?: string; owner?: string[] }
export interface Impact { id: string; changeId: string; usage: 'jsx-component' | 'jsx-prop' | 'import' | 'token'; subject: string; observedValue?: string; location: ImpactLocation; confidence: 'high' | 'medium'; automatic: boolean }
export interface ImpactReport { schemaVersion: 1; kind: 'design-system-impact-report'; package: string; impacts: Impact[]; diagnostics: Diagnostic[] }
export interface MigrationTask { id: string; changeIds: string[]; title: string; locations: ImpactLocation[]; instruction: string; automatic: boolean; confidence: 'high' | 'medium'; replacement?: { from: string; to: string } }
export interface MigrationManifest { schemaVersion: 1; kind: 'design-system-migration-manifest'; migration: { package: string; from?: string; to?: string }; tasks: MigrationTask[]; diagnostics: Diagnostic[] }
export interface ImpactConfig { designSystem: { package: string; entry: string }; tokens?: string[]; consumers?: string[]; ownership?: { codeowners: string }; migrations?: MigrationHints }
