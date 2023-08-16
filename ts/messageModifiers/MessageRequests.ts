// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable max-classes-per-file */

import { Collection, Model } from 'backbone';
import type { ConversationModel } from '../models/conversations';
import * as log from '../logging/log';
import * as Errors from '../types/errors';
import type { AciString } from '../types/ServiceId';

export type MessageRequestAttributesType = {
  threadE164?: string;
  threadAci?: AciString;
  groupV2Id?: string;
  type: number;
};

class MessageRequestModel extends Model<MessageRequestAttributesType> {}

let singleton: MessageRequests | undefined;

export class MessageRequests extends Collection<MessageRequestModel> {
  static getSingleton(): MessageRequests {
    if (!singleton) {
      singleton = new MessageRequests();
    }

    return singleton;
  }

  forConversation(conversation: ConversationModel): MessageRequestModel | null {
    if (conversation.get('e164')) {
      const syncByE164 = this.findWhere({
        threadE164: conversation.get('e164'),
      });
      if (syncByE164) {
        log.info(
          `Found early message request response for E164 ${conversation.idForLogging()}`
        );
        this.remove(syncByE164);
        return syncByE164;
      }
    }

    if (conversation.getServiceId()) {
      const syncByAci = this.findWhere({
        threadAci: conversation.getServiceId(),
      });
      if (syncByAci) {
        log.info(
          `Found early message request response for aci ${conversation.idForLogging()}`
        );
        this.remove(syncByAci);
        return syncByAci;
      }
    }

    // V2 group
    if (conversation.get('groupId')) {
      const syncByGroupId = this.findWhere({
        groupV2Id: conversation.get('groupId'),
      });
      if (syncByGroupId) {
        log.info(
          `Found early message request response for group v2 ID ${conversation.idForLogging()}`
        );
        this.remove(syncByGroupId);
        return syncByGroupId;
      }
    }

    return null;
  }

  async onResponse(sync: MessageRequestModel): Promise<void> {
    try {
      const threadE164 = sync.get('threadE164');
      const threadAci = sync.get('threadAci');
      const groupV2Id = sync.get('groupV2Id');

      let conversation;

      // We multiplex between GV1/GV2 groups here, but we don't kick off migrations
      if (groupV2Id) {
        conversation = window.ConversationController.get(groupV2Id);
      }
      if (!conversation && (threadE164 || threadAci)) {
        conversation = window.ConversationController.lookupOrCreate({
          e164: threadE164,
          serviceId: threadAci,
          reason: 'MessageRequests.onResponse',
        });
      }

      if (!conversation) {
        log.warn(
          `Received message request response for unknown conversation: groupv2(${groupV2Id}) ${threadAci} ${threadE164}`
        );
        return;
      }

      void conversation.applyMessageRequestResponse(sync.get('type'), {
        fromSync: true,
      });

      this.remove(sync);
    } catch (error) {
      log.error('MessageRequests.onResponse error:', Errors.toLogFormat(error));
    }
  }
}
