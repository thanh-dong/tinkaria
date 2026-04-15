import type { PuggyDiagnostic } from "../index";

export interface AttrNode {
  readonly name: string;
  readonly value: string | null;
  readonly expression: boolean;
  readonly column: number;
}

export type PuggyNode =
  | ElementNode
  | TextNode
  | ExprTextNode
  | OmitNode
  | IfNode
  | EachNode
  | IncludeNode
  | ExtendsNode
  | BlockNode
  | MixinNode
  | MixinCallNode;

export interface BaseNode {
  readonly line: number;
  readonly column: number;
}

export interface ElementNode extends BaseNode {
  readonly kind: "element";
  readonly tag: string;
  readonly classes: readonly string[];
  readonly id?: string;
  readonly attrs: readonly AttrNode[];
  readonly text?: string;
  readonly textColumn?: number;
  readonly expr?: string;
  readonly exprColumn?: number;
  readonly rawText?: boolean;
  readonly children: PuggyNode[];
}

export interface TextNode extends BaseNode {
  readonly kind: "text";
  readonly value: string;
}

export interface ExprTextNode extends BaseNode {
  readonly kind: "expr";
  readonly expression: string;
}

export interface OmitNode extends BaseNode {
  readonly kind: "omit";
  readonly children: PuggyNode[];
}

export interface IfNode extends BaseNode {
  readonly kind: "if";
  readonly expression: string;
  readonly consequent: PuggyNode[];
  readonly alternate: PuggyNode[];
}

export interface EachNode extends BaseNode {
  readonly kind: "each";
  readonly itemName: string;
  readonly listExpression: string;
  readonly children: PuggyNode[];
}

export interface IncludeNode extends BaseNode {
  readonly kind: "include";
  readonly name: string;
}

export interface ExtendsNode extends BaseNode {
  readonly kind: "extends";
  readonly name: string;
}

export interface BlockNode extends BaseNode {
  readonly kind: "block";
  readonly name: string;
  readonly children: PuggyNode[];
}

export interface MixinNode extends BaseNode {
  readonly kind: "mixin";
  readonly name: string;
  readonly params: readonly string[];
  readonly children: PuggyNode[];
}

export interface MixinCallNode extends BaseNode {
  readonly kind: "mixin-call";
  readonly name: string;
  readonly args: readonly string[];
}

export interface ParseSuccess {
  readonly ok: true;
  readonly nodes: readonly PuggyNode[];
}

export interface ParseFailure {
  readonly ok: false;
  readonly diagnostics: readonly PuggyDiagnostic[];
}

export type ParseResult = ParseSuccess | ParseFailure;
