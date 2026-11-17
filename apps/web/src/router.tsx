import { createBrowserRouter } from 'react-router';

import { AudienceListPage } from './audiences/AudienceListPage';
import { AppLayout, RouteError } from './layout/AppLayout';
import { LoadingState } from './ui/states';

// The builder (with its combobox) loads on first visit, keeping the home page bundle small.
const loadMembers = () => import('./audiences/AudienceMembersPage');
const loadRuns = () => import('./runs/RunHistoryPage');
const loadBuilder = () => import('./audiences/AudienceBuilderPage');

export const routes = [
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <LoadingState label="Loading…" />,
    children: [
      { path: '/', element: <AudienceListPage /> },
      {
        path: '/runs',
        lazy: async () => ({ Component: (await loadRuns()).RunHistoryPage }),
      },
      {
        path: '/audiences/new',
        lazy: async () => ({ Component: (await loadBuilder()).NewAudiencePage }),
      },
      {
        path: '/audiences/:id/members',
        lazy: async () => ({ Component: (await loadMembers()).AudienceMembersPage }),
      },
      {
        path: '/audiences/:id',
        lazy: async () => ({ Component: (await loadBuilder()).EditAudiencePage }),
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
