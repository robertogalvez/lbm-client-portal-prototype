'use client';

import { useState, createContext, useContext, type ReactNode } from 'react';

type Tab = 'video' | 'caption';

interface ReviewTabsContextValue {
  activeTab: Tab;
  captionSeen: boolean;
}

const ReviewTabsContext = createContext<ReviewTabsContextValue>({ activeTab: 'video', captionSeen: true });

export function useReviewTabs() {
  return useContext(ReviewTabsContext);
}

export function TabPanel({ tab, className, children }: { tab: Tab; className?: string; children: ReactNode }) {
  const { activeTab } = useReviewTabs();
  return (
    <div className={`vd-tab-panel${activeTab === tab ? ' vd-tab-panel-active' : ''} ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function ReviewTabs({
  hasCaption,
  children,
}: {
  hasCaption: boolean;
  children: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('video');
  const [captionSeen, setCaptionSeen] = useState(false);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    if (tab === 'caption') setCaptionSeen(true);
  }

  return (
    <ReviewTabsContext.Provider value={{ activeTab, captionSeen }}>
      {hasCaption && (
        <div className="vd-tabs">
          <button
            type="button"
            className={`vd-tab${activeTab === 'video' ? ' vd-tab-active' : ''}`}
            onClick={() => switchTab('video')}
          >
            Video
          </button>
          <button
            type="button"
            className={`vd-tab${activeTab === 'caption' ? ' vd-tab-active' : ''}`}
            onClick={() => switchTab('caption')}
          >
            Caption
            {!captionSeen && <span className="vd-unseen-dot" />}
          </button>
        </div>
      )}
      {children}
    </ReviewTabsContext.Provider>
  );
}
