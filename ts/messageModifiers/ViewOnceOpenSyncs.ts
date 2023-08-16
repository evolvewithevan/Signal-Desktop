// Copyright 2019 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable max-classes-per-file */

import { Collection, Model } from 'backbone';
import type { MessageModel } from '../models/messages';
import * as log from '../logging/log';
import * as Errors from '../types/errors';
import type { AciString } from '../types/ServiceId';

export type ViewOnceOpenSyncAttributesType = {
  source?: string;
  sourceAci: AciString;
  timestamp: number;
};

class ViewOnceOpenSyncModel extends Model<ViewOnceOpenSyncAttributesType> {}

let singleton: ViewOnceOpenSyncs | undefined;

export class ViewOnceOpenSyncs extends Collection<ViewOnceOpenSyncModel> {
  static getSingleton(): ViewOnceOpenSyncs {
    if (!singleton) {
      singleton = new ViewOnceOpenSyncs();
    }

    return singleton;
  }

  forMessage(message: MessageModel): ViewOnceOpenSyncModel | null {
    const syncBySourceAci = this.find(item => {
      return (
        item.get('sourceAci') === message.get('sourceServiceId') &&
        item.get('timestamp') === message.get('sent_at')
      );
    });
    if (syncBySourceAci) {
      log.info('Found early view once open sync for message');
      this.remove(syncBySourceAci);
      return syncBySourceAci;
    }

    const syncBySource = this.find(item => {
      return (
        item.get('source') === message.get('source') &&
        item.get('timestamp') === message.get('sent_at')
      );
    });
    if (syncBySource) {
      log.info('Found early view once open sync for message');
      this.remove(syncBySource);
      return syncBySource;
    }

    return null;
  }

  async onSync(sync: ViewOnceOpenSyncModel): Promise<void> {
    try {
      const messages = await window.Signal.Data.getMessagesBySentAt(
        sync.get('timestamp')
      );

      const found = messages.find(item => {
        const itemSourceAci = item.sourceServiceId;
        const syncSourceAci = sync.get('sourceAci');
        const itemSource = item.source;
        const syncSource = sync.get('source');

        return Boolean(
          (itemSourceAci && syncSourceAci && itemSourceAci === syncSourceAci) ||
            (itemSource && syncSource && itemSource === syncSource)
        );
      });

      const syncSource = sync.get('source');
      const syncSourceAci = sync.get('sourceAci');
      const syncTimestamp = sync.get('timestamp');
      const wasMessageFound = Boolean(found);
      log.info('Receive view once open sync:', {
        syncSource,
        syncSourceAci,
        syncTimestamp,
        wasMessageFound,
      });

      if (!found) {
        return;
      }

      const message = window.MessageController.register(found.id, found);
      await message.markViewOnceMessageViewed({ fromSync: true });

      this.remove(sync);
    } catch (error) {
      log.error('ViewOnceOpenSyncs.onSync error:', Errors.toLogFormat(error));
    }
  }
}
