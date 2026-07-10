import clsx from 'clsx';
import React, { useEffect, useState } from 'react';

import { BookDoc } from '@/libs/document';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { eventDispatcher } from '@/utils/event';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';

import TOCView from './TOCView';
import BooknoteView from './BooknoteView';
import TabNavigation from './TabNavigation';
import ChatHistoryView from './ChatHistoryView';
import ImageGenView from './ImageGenView';

const SidebarContent: React.FC<{
  bookDoc: BookDoc;
  sideBarBookKey: string;
}> = ({ bookDoc, sideBarBookKey }) => {
  const { setHoveredBookKey } = useReaderStore();
  const { setSideBarVisible } = useSidebarStore();
  const { getConfig, setConfig } = useBookDataStore();
  const { settings } = useSettingsStore();
  const config = getConfig(sideBarBookKey);
  const [activeTab, setActiveTab] = useState(config?.viewSettings?.sideBarTab || 'toc');
  const [fade, setFade] = useState(false);
  const [targetTab, setTargetTab] = useState(activeTab);
  const isMobile = window.innerWidth < 640 || window.innerHeight < 640;
  const aiEnabled = settings?.aiSettings?.enabled ?? false;

  useEffect(() => {
    if (!sideBarBookKey) return;
    const cfg = getConfig(sideBarBookKey);
    const tab = cfg?.viewSettings?.sideBarTab || 'toc';
    setActiveTab(tab);
    setTargetTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideBarBookKey]);

  // reset to toc if AI tabs were active but AI is now disabled
  useEffect(() => {
    if (!aiEnabled && (activeTab === 'history' || activeTab === 'images')) {
      setActiveTab('toc');
      setTargetTab('toc');
    }
  }, [aiEnabled, activeTab]);

  const handleTabChange = (tab: string) => {
    // Always allow switching to a tab (including re-selecting for mobile close).
    if (activeTab === tab) {
      if (isMobile && tab !== 'images') {
        setHoveredBookKey(sideBarBookKey);
        setSideBarVisible(false);
      }
      // Ensure target matches (event may fire before fade completes).
      setTargetTab(tab);
      return;
    }

    setFade(true);
    const timeout = setTimeout(() => {
      setTargetTab(tab);
      setFade(false);
      setConfig(sideBarBookKey!, config);
      clearTimeout(timeout);
    }, 300);

    setActiveTab(tab);
    const config = getConfig(sideBarBookKey!)!;
    config.viewSettings!.sideBarTab = tab;
  };

  // Open Images tab when Illustrate runs (or other callers dispatch this event).
  // Avoid setConfig here — mutating config every open can re-render the tree
  // and re-fire listeners; tab state is local + sideBarTab is written on change.
  useEffect(() => {
    const onOpenImages = (e: Event) => {
      const detail = (e as CustomEvent).detail as { bookKey?: string } | undefined;
      if (detail?.bookKey && detail.bookKey !== sideBarBookKey) return;
      setSideBarVisible(true);
      setActiveTab('images');
      setTargetTab('images');
      setFade(false);
      const cfg = getConfig(sideBarBookKey);
      if (cfg?.viewSettings && cfg.viewSettings.sideBarTab !== 'images') {
        cfg.viewSettings.sideBarTab = 'images';
        setConfig(sideBarBookKey, cfg);
      }
    };
    eventDispatcher.on('sidebar-open-images', onOpenImages);
    return () => eventDispatcher.off('sidebar-open-images', onOpenImages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideBarBookKey]);

  return (
    <>
      <div
        className={clsx(
          'sidebar-content flex h-full min-h-0 flex-grow flex-col shadow-inner',
          'font-sans text-base font-normal sm:text-sm',
        )}
      >
        {targetTab === 'history' ? (
          <ChatHistoryView bookKey={sideBarBookKey} />
        ) : targetTab === 'images' ? (
          <div
            className={clsx(
              'min-h-0 flex-1 transition-opacity duration-300 ease-in-out',
              fade ? 'opacity-0' : 'opacity-100',
            )}
          >
            <ImageGenView bookKey={sideBarBookKey} />
          </div>
        ) : (
          <OverlayScrollbarsComponent
            className='min-h-0 flex-1'
            options={{
              scrollbars: { autoHide: 'scroll', clickScroll: true },
              showNativeOverlaidScrollbars: false,
            }}
            defer
          >
            <div
              className={clsx(
                'scroll-container h-full transition-opacity duration-300 ease-in-out',
                {
                  'opacity-0': fade,
                  'opacity-100': !fade,
                },
              )}
            >
              {targetTab === 'toc' && bookDoc.toc && (
                <TOCView toc={bookDoc.toc} bookKey={sideBarBookKey} />
              )}
              {targetTab === 'annotations' && (
                <BooknoteView type='annotation' toc={bookDoc.toc ?? []} bookKey={sideBarBookKey} />
              )}
              {targetTab === 'bookmarks' && (
                <BooknoteView type='bookmark' toc={bookDoc.toc ?? []} bookKey={sideBarBookKey} />
              )}
            </div>
          </OverlayScrollbarsComponent>
        )}
      </div>
      <div
        className='flex-shrink-0'
        style={
          {
            // paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) / 2)',
          }
        }
      >
        <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </>
  );
};

export default SidebarContent;
