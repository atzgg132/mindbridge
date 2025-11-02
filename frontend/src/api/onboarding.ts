import api from '../lib/api'
import type { ApiResponse, OnboardingData, OnboardingSubmission } from '../types'

export const onboardingApi = {
  async get(): Promise<OnboardingData | null> {
    const response = await api.get<ApiResponse<OnboardingData | null>>('/onboarding')
    return response.data.data ?? null
  },

  async submit(payload: OnboardingSubmission): Promise<OnboardingData> {
    const response = await api.post<ApiResponse<OnboardingData>>('/onboarding', payload)
    return response.data.data
  },
}
