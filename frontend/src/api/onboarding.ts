import api from '../lib/api'
import type { ApiResponse, OnboardingData, OnboardingSubmission } from '../types'

export const onboardingApi = {
  async get(): Promise<OnboardingData | null> {
    const response = await api.get<ApiResponse<OnboardingData | null>>('/onboarding')
    return response.data.data ?? null
  },

  async submit(payload: OnboardingSubmission): Promise<{ data: OnboardingData; token?: string }> {
    const response = await api.post<ApiResponse<OnboardingData> & { token?: string }>('/onboarding', payload)
    return {
      data: response.data.data,
      token: response.data.token
    }
  },
}
