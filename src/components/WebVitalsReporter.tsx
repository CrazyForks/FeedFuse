'use client';

import { useReportWebVitals } from 'next/web-vitals';

export const WEB_VITAL_EVENT_NAME = 'feedfuse:web-vital';

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    // 统一暴露指标事件，部署方可按需接入自有监控而不增加首屏网络请求。
    window.dispatchEvent(new CustomEvent(WEB_VITAL_EVENT_NAME, { detail: metric }));

    if (process.env.NODE_ENV === 'development') {
      console.debug('[Web Vitals]', metric);
    }
  });

  return null;
}
