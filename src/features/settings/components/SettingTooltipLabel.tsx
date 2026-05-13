'use client';

import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SettingTooltipLabelProps {
  label: string;
  description: string;
  className?: string;
}

export default function SettingTooltipLabel({
  label,
  description,
  className,
}: SettingTooltipLabelProps) {
  // 关闭 hoverable content，并让内容不接收指针事件，避免任意方向移入/移出时抖动。
  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={220} disableHoverableContent>
      <Tooltip disableHoverableContent>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn(className)}>{label}</span>
          {/* 只在 hover/focus 问号图标时展示解释，降低主界面噪声。 */}
          <TooltipTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              aria-label={`查看 ${label} 说明`}
              className="inline-flex cursor-help rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <CircleHelp size={14} aria-hidden="true" />
            </span>
          </TooltipTrigger>
        </span>
        <TooltipContent
          side="top"
          align="start"
          sideOffset={8}
          className="pointer-events-none max-w-72 whitespace-normal leading-relaxed"
        >
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
