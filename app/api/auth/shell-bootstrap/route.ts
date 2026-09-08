import { NextRequest, NextResponse } from 'next/server';
import { createUser, findUserByEmail, findUserById } from '@/lib/repos/user-repo';
import { getUserById, sessionCookieHeader, signToken } from '@/app/api/auth/lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHELL_EMAIL = 'dev@dawnvision.local';
const SHELL_NAME = '晓阳叙影';

/**
 * 前端壳模式引导：确保 DB 有开发用户，签发真 JWT + 会话 cookie。
 * 仅当 NEXT_PUBLIC_DAWNVISION_SHELL=1（或 DAWNVISION_SHELL=1）时可用。
 */
export async function POST(_request: NextRequest) {
  const shellOn =
    process.env.NEXT_PUBLIC_DAWNVISION_SHELL === '1' || process.env.DAWNVISION_SHELL === '1';
  if (!shellOn) {
    return NextResponse.json({ error: 'shell mode disabled' }, { status: 403 });
  }

  let user = await findUserByEmail(SHELL_EMAIL);
  if (!user) {
    // 固定 id，方便与前端壳用户对齐；若冲突则回读
    try {
      user = await createUser({
        id: 'shell-dev',
        email: SHELL_EMAIL,
        passwordHash: 'shell-no-password',
        name: SHELL_NAME,
        role: 'admin',
      });
    } catch {
      user = (await findUserById('shell-dev')) || (await findUserByEmail(SHELL_EMAIL));
    }
  }
  if (!user) {
    return NextResponse.json({ error: 'failed to bootstrap shell user' }, { status: 500 });
  }

  // 放开壳用户预算，避免本地试创作被档位硬顶拦住
  try {
    const { getDbDriver } = await import('@/lib/db-driver');
    await getDbDriver().run(
      `UPDATE users SET budget_cap_cny = ?, budget_hard_cap_cny = ?, subscription_tier = ? WHERE id = ?`,
      [999999, 999999, 'enterprise', user.id],
    );
  } catch (e) {
    console.warn('[shell-bootstrap] budget update skipped:', e);
  }

  const token = signToken({ id: user.id, role: user.role || 'admin' });
  const profile = getUserById(user.id) || {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: '',
    locale: 'zh',
  };

  const res = NextResponse.json({ token, user: profile });
  res.headers.set('Set-Cookie', sessionCookieHeader(token));
  return res;
}
