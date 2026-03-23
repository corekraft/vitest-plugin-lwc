/**
 * For the original lightning/messageService (LMS) stub that comes by default with
 * @salesforce/sfdx-lwc-jest, see:
 * https://github.com/salesforce/sfdx-lwc-jest/blob/master/src/lightning-stubs/messageService/messageService.js
 */
import { createTestWireAdapter } from '@salesforce/wire-service-jest-util';

const mockApi = globalThis.vi ?? globalThis.jest;

export const APPLICATION_SCOPE = Symbol('APPLICATION_SCOPE');
export const createMessageChannel = mockApi.fn();
export const createMessageContext = mockApi.fn();
export const MessageContext = createTestWireAdapter(mockApi.fn());
export const releaseMessageContext = mockApi.fn();

// Counter that keeps track of mock subscription IDs
let mockSubsriptionId = 0;

// Assigns a handler for each channel subscribed, so that multiple channels can be subscribed to
// within the same test execution context
const handlers = {};

export const publish = mockApi.fn((messageContext, messageChannel, message) => {
    handlers[messageChannel]?.forEach((handlerObj) =>
        handlerObj.handler(message)
    );
});

export const subscribe = mockApi.fn(
    (messageContext, messageChannel, messageHandler) => {
        const subscriptionId = mockSubsriptionId++;

        if (!handlers[messageChannel]) {
            handlers[messageChannel] = [];
        }

        handlers[messageChannel].push({
            id: subscriptionId,
            handler: messageHandler
        });

        return { id: subscriptionId };
    }
);

export const unsubscribe = mockApi.fn((subscription) => {
    Object.keys(handlers).forEach((messageChannel) => {
        handlers[messageChannel] = handlers[messageChannel].filter(
            (handler) => handler.id !== subscription.id
        );
    });
});
