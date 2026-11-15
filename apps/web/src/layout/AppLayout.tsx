import { isRouteErrorResponse, Link, Outlet, useLocation, useRouteError } from 'react-router';

import { PageMessage } from '../ui/states';

/** A header link that stays highlighted on every page of its section. */
function SectionLink({ to, section, children }: { to: string; section: string; children: string }) {
  const { pathname } = useLocation();
  const inSection = pathname === to || pathname.startsWith(`${section}/`);
  const current = pathname === to ? 'page' : inSection ? 'true' : undefined;
  return (
    <Link
      to={to}
      aria-current={current}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        inSection ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
          <Link to="/" className="text-base font-semibold tracking-tight text-slate-900">
            Agents-Driven Flow
          </Link>
          <nav aria-label="Main">
            <SectionLink to="/" section="/audiences">
              Audiences
            </SectionLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

/** Wraps every page, so each new page gets the header without repeating it. */
export function AppLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

const homeLink = { to: '/', label: 'Go to the home page' };

/** Shown for unknown addresses and for errors no page handled. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <Shell>
      {notFound ? (
        <PageMessage title="Page not found" link={homeLink}>
          There is no page at this address.
        </PageMessage>
      ) : (
        <PageMessage title="Something went wrong" link={homeLink}>
          Reload the page, or start again from the home page.
        </PageMessage>
      )}
    </Shell>
  );
}
