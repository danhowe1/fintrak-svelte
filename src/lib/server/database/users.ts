import { z } from 'zod';
import { getPool, type DbClient } from './shared';

const userIdSchema = z.string().min(1);
const userEmailSchema = z.string().trim().min(1).optional();
const userNameSchema = z.string().trim().min(1).optional();

export function getAuthenticatedUser(
	session: {
		user?: { id?: string | null; email?: string | null; name?: string | null };
	} | null
) {
	return {
		id: userIdSchema.parse(session?.user?.id),
		email: userEmailSchema.parse(session?.user?.email ?? undefined),
		name: userNameSchema.parse(session?.user?.name ?? undefined)
	};
}

export async function resolveAuthenticatedUserId(
	session: {
		user?: { id?: string | null; email?: string | null; name?: string | null };
	} | null
) {
	const { id, email, name } = getAuthenticatedUser(session);
	const provider = 'auth0';

	const identity = await getIdentity(provider, id);
	if (identity) {
		await ensureAppUser(identity.app_user_id, { email, name });
		return identity.app_user_id;
	}

	if (email) {
		const existingByEmail = await getAppUserIdByEmail(email);
		if (existingByEmail) {
			await ensureAppUser(existingByEmail, { email, name });
			await createIdentity(provider, id, existingByEmail);
			return existingByEmail;
		}
	}

	const newAppUserId = await createAppUser({ email, name });
	await createIdentity(provider, id, newAppUserId);
	return newAppUserId;
}

export async function ensureAppUser(
	userId: string,
	input?: { email?: string; name?: string },
	client?: DbClient
) {
	const db = client ?? getPool();
	await db.query(
		`
			insert into app_users (id, email, name)
			values ($1::text, $2::text, $3::text)
			on conflict (id) do update
			set email = coalesce(excluded.email, app_users.email),
			    name = coalesce(excluded.name, app_users.name)
		`,
		[userId, input?.email ?? null, input?.name ?? null]
	);
}

async function getAppUserIdByEmail(email: string) {
	const result = await getPool().query<{ id: string }>(
		`
			select id
			from app_users
			where email = $1::text
			order by created_at asc
			limit 1
		`,
		[email]
	);

	return result.rows[0]?.id ?? null;
}

async function createAppUser(input?: { email?: string; name?: string }) {
	const result = await getPool().query<{ id: string }>(
		`
			insert into app_users (id, email, name)
			values (gen_random_uuid()::text, $1::text, $2::text)
			returning id
		`,
		[input?.email ?? null, input?.name ?? null]
	);

	const id = result.rows[0]?.id;
	if (!id) {
		throw new Error('App user insert failed');
	}

	return id;
}

async function getIdentity(provider: string, providerUserId: string) {
	const result = await getPool().query<{ app_user_id: string }>(
		`
			select app_user_id
			from app_user_identities
			where provider = $1::text
			  and provider_user_id = $2::text
			limit 1
		`,
		[provider, providerUserId]
	);

	return result.rows[0] ?? null;
}

async function createIdentity(provider: string, providerUserId: string, appUserId: string) {
	await getPool().query(
		`
			insert into app_user_identities (app_user_id, provider, provider_user_id)
			values ($1::text, $2::text, $3::text)
			on conflict (provider, provider_user_id) do nothing
		`,
		[appUserId, provider, providerUserId]
	);
}
