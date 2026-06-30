import { Schema } from 'effect';

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{ httpApiStatus: 401 }
) {}

export class BadRequest extends Schema.TaggedErrorClass<BadRequest>()(
	'BadRequest',
	{ message: Schema.String },
	{ httpApiStatus: 400 }
) {}

export class Forbidden extends Schema.TaggedErrorClass<Forbidden>()(
	'Forbidden',
	{ message: Schema.String },
	{ httpApiStatus: 403 }
) {}

export class NotFound extends Schema.TaggedErrorClass<NotFound>()(
	'NotFound',
	{ message: Schema.String },
	{ httpApiStatus: 404 }
) {}

export class InvalidInstallationState extends Schema.TaggedErrorClass<InvalidInstallationState>()(
	'InvalidInstallationState',
	{ message: Schema.String },
	{ httpApiStatus: 400 }
) {}

export class InvalidAuthorization extends Schema.TaggedErrorClass<InvalidAuthorization>()(
	'InvalidAuthorization',
	{ message: Schema.String },
	{ httpApiStatus: 400 }
) {}

export class AuthorizationPending extends Schema.TaggedErrorClass<AuthorizationPending>()(
	'AuthorizationPending',
	{ message: Schema.String },
	{ httpApiStatus: 409 }
) {}
