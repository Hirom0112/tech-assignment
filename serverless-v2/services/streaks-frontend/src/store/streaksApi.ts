import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../store';
import type {
  StreaksResponse,
  CalendarResponse,
  RewardRecord,
  FreezesResponse,
  BadgesResponse,
  CheckInResponse,
} from '../types/streaks.types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

/**
 * RTK Query slice — the single place that talks to the streaks backend.
 * Components stay presentational and consume the generated hooks.
 */
export const streaksApi = createApi({
  reducerPath: 'streaksApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/v1/player/streaks`,
    prepareHeaders: (headers, { getState }) => {
      const fromStore = (getState() as RootState).auth.playerId;
      const playerId = fromStore || localStorage.getItem('playerId');
      if (playerId) headers.set('X-Player-Id', playerId);
      return headers;
    },
  }),
  tagTypes: ['Streaks', 'Calendar', 'Rewards', 'Freezes', 'Badges'],
  endpoints: (builder) => ({
    getStreaks: builder.query<StreaksResponse, void>({
      query: () => '',
      providesTags: ['Streaks'],
    }),
    getCalendar: builder.query<CalendarResponse, string>({
      query: (month) => `/calendar?month=${month}`,
      providesTags: ['Calendar'],
    }),
    getRewards: builder.query<RewardRecord[], void>({
      query: () => '/rewards',
      providesTags: ['Rewards'],
    }),
    getFreezes: builder.query<FreezesResponse, void>({
      query: () => '/freezes',
      providesTags: ['Freezes'],
    }),
    getBadges: builder.query<BadgesResponse, void>({
      query: () => '/badges',
      providesTags: ['Badges'],
    }),
    checkIn: builder.mutation<CheckInResponse, void>({
      query: () => ({ url: '/check-in', method: 'POST' }),
      invalidatesTags: ['Streaks', 'Calendar', 'Rewards', 'Freezes', 'Badges'],
    }),
  }),
});

export const {
  useGetStreaksQuery,
  useGetCalendarQuery,
  useGetRewardsQuery,
  useGetFreezesQuery,
  useGetBadgesQuery,
  useCheckInMutation,
} = streaksApi;
