import { Brand, Schema } from 'effect';

export const KeychainSource = Schema.Struct({
	name: Schema.String,
	service: Schema.String,
	type: Schema.Literal('keychain'),
});

export const Source = Schema.Union([KeychainSource]);
export type Source = typeof Source.Type;

export type VarId = string & Brand.Brand<'VarId'>;
const VarId = Brand.make<VarId>((id) => id.startsWith('var_'));
export const newVarId = (): VarId => VarId(`var_${crypto.randomUUID()}`);

export const VarIdSchema = Schema.String.pipe(
	Schema.fromBrand('VarId', VarId)
);

export type EnvLabel = string & Brand.Brand<'EnvLabel'>;
const EnvLabel = Brand.nominal<EnvLabel>();
export const envLabel = (name: string): EnvLabel => EnvLabel(name);

export const EnvLabelSchema = Schema.String.pipe(
	Schema.fromBrand('EnvLabel', EnvLabel)
);

export const Var = Schema.Struct({
	id: VarIdSchema,
	label: EnvLabelSchema,
	source: Source,
});
export type Var = typeof Var.Type;

export const Binding = Schema.Struct({
	accountId: Schema.String,
	region: Schema.optional(Schema.String),
	roleName: Schema.optional(Schema.String),
});
export type Binding = typeof Binding.Type;

export const Entry = Schema.Struct({
	binding: Schema.optional(Binding),
	expiresOn: Schema.optional(Schema.String),
	issuedOn: Schema.optional(Schema.String),
	provider: Schema.optional(Schema.String),
	tokenId: Schema.optional(Schema.String),
	vars: Schema.Array(Var),
});
export type Entry = typeof Entry.Type;

export const ManagedBinding = Schema.Struct({
	bindingId: Schema.String,
	connector: Schema.Literal('github'),
	outputs: Schema.NonEmptyArray(Schema.String),
});
export type ManagedBinding = typeof ManagedBinding.Type;

export const Manifest = Schema.Struct({
	bindings: Schema.optional(Schema.Array(ManagedBinding)),
	secrets: Schema.Array(Entry),
	version: Schema.Literal(1),
});
export type Manifest = typeof Manifest.Type;