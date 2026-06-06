import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	topics,
	topicMap,
	settings,
	syncState,
	conflictQueue,
	activeConflict,
	activeTopicKey,
	isMobile,
	editorMode,
	collapseSidebar,
	listActiveType,
	listActiveStatus,
	listSortBy,
	selectedForDeletion,
	chatOpen,
	chatMessages,
	mcpOpen,
	initialising,
	toasts,
	showToast,
} from '$lib/stores';
import type { Topic } from '$lib/types';

describe('stores', () => {
	beforeEach(() => {
		// Reset all stores to initial state
		topics.set([]);
		settings.set({
			workerHost: 'https://holmgard-lore-mcp.frozenregister.workers.dev',
			autoSyncIntervalSecs: 30,
			autoSync: true,
			syncHistory: false,
		});
		syncState.set({ status: 'idle' });
		conflictQueue.set([]);
		activeTopicKey.set(null);
		isMobile.set(false);
		editorMode.set('edit');
		chatOpen.set(false);
		chatMessages.set([]);
		mcpOpen.set(false);
		initialising.set(true);
		toasts.set([]);
		// Clear localStorage for filter stores
		localStorage.clear();
	});

	// ── topics store ───────────────────────────────────────────────────────────

	describe('topics store', () => {
		it('should initialize with empty array', () => {
			expect(get(topics)).toEqual([]);
		});

		it('should accept new topics', () => {
			const testTopics: Topic[] = [
				{
					key: 'test-topic-1',
					text: '# Test Topic 1',
					meta: { updatedAt: '2024-01-01T00:00:00.000Z', version: 1 },
				},
				{
					key: 'test-topic-2',
					text: '# Test Topic 2',
					meta: { updatedAt: '2024-01-02T00:00:00.000Z', version: 1 },
				},
			];
			topics.set(testTopics);
			expect(get(topics)).toEqual(testTopics);
		});

		it('should update topics array', () => {
			topics.set([]);
			topics.update((t) => [
				...t,
				{
					key: 'new-topic',
					text: '# New Topic',
					meta: { updatedAt: new Date().toISOString(), version: 1 },
				},
			]);
			expect(get(topics)).toHaveLength(1);
			expect(get(topics)[0].key).toBe('new-topic');
		});
	});

	// ── topicMap derived store ─────────────────────────────────────────────────

	describe('topicMap derived store', () => {
		it('should create empty map when topics is empty', () => {
			topics.set([]);
			expect(get(topicMap).size).toBe(0);
		});

		it('should create map with topic keys', () => {
			const testTopics: Topic[] = [
				{
					key: 'topic-a',
					text: 'Content A',
					meta: { updatedAt: '2024-01-01T00:00:00.000Z', version: 1 },
				},
				{
					key: 'topic-b',
					text: 'Content B',
					meta: { updatedAt: '2024-01-02T00:00:00.000Z', version: 1 },
				},
			];
			topics.set(testTopics);
			const map = get(topicMap);
			expect(map.size).toBe(2);
			expect(map.get('topic-a')).toEqual(testTopics[0]);
			expect(map.get('topic-b')).toEqual(testTopics[1]);
		});

		it('should update when topics change', () => {
			topics.set([]);
			expect(get(topicMap).size).toBe(0);

			topics.set([
				{
					key: 'new-topic',
					text: 'New Content',
					meta: { updatedAt: new Date().toISOString(), version: 1 },
				},
			]);
			expect(get(topicMap).size).toBe(1);
			expect(get(topicMap).has('new-topic')).toBe(true);
		});
	});

	// ── settings store ─────────────────────────────────────────────────────────

	describe('settings store', () => {
		it('should initialize with default values', () => {
			const defaultSettings = get(settings);
			expect(defaultSettings.workerHost).toBe(
				'https://holmgard-lore-mcp.frozenregister.workers.dev'
			);
			expect(defaultSettings.autoSyncIntervalSecs).toBe(30);
			expect(defaultSettings.autoSync).toBe(true);
			expect(defaultSettings.syncHistory).toBe(false);
		});

		it('should accept new settings', () => {
			settings.set({
				workerHost: 'https://custom-host.example.com',
				autoSyncIntervalSecs: 60,
				autoSync: false,
				syncHistory: true,
			});
			const s = get(settings);
			expect(s.workerHost).toBe('https://custom-host.example.com');
			expect(s.autoSyncIntervalSecs).toBe(60);
			expect(s.autoSync).toBe(false);
			expect(s.syncHistory).toBe(true);
		});

		it('should update individual settings', () => {
			settings.update((s) => ({ ...s, autoSync: false }));
			expect(get(settings).autoSync).toBe(false);
		});

		it('should preserve other settings when updating', () => {
			const originalWorkerHost = get(settings).workerHost;
			settings.update((s) => ({ ...s, autoSync: false }));
			expect(get(settings).workerHost).toBe(originalWorkerHost);
		});
	});

	// ── syncState store ────────────────────────────────────────────────────────

	describe('syncState store', () => {
		it('should initialize with idle status', () => {
			expect(get(syncState).status).toBe('idle');
		});

		it('should accept sync status updates', () => {
			syncState.set({ status: 'syncing' });
			expect(get(syncState).status).toBe('syncing');
		});

		it('should include lastSync timestamp on success', () => {
			const now = new Date().toISOString();
			syncState.set({ status: 'success', lastSync: now });
			expect(get(syncState).status).toBe('success');
			expect(get(syncState).lastSync).toBe(now);
		});

		it('should include error message on error', () => {
			syncState.set({ status: 'error', error: 'Network error' });
			expect(get(syncState).status).toBe('error');
			expect(get(syncState).error).toBe('Network error');
		});
	});

	// ── conflictQueue and activeConflict ───────────────────────────────────────

	describe('conflictQueue and activeConflict', () => {
		it('should initialize with empty queue', () => {
			expect(get(conflictQueue)).toEqual([]);
			expect(get(activeConflict)).toBeNull();
		});

		it('should expose first conflict as activeConflict', () => {
			const conflicts = [
				{
					key: 'conflict-1',
					base: 'base text',
					local: 'local text',
					remote: 'remote text',
					remoteMeta: { updatedAt: '2024-01-01T00:00:00.000Z', version: 1 },
				},
				{
					key: 'conflict-2',
					base: 'base text 2',
					local: 'local text 2',
					remote: 'remote text 2',
					remoteMeta: { updatedAt: '2024-01-02T00:00:00.000Z', version: 1 },
				},
			];
			conflictQueue.set(conflicts);
			expect(get(activeConflict)).toEqual(conflicts[0]);
		});

		it('should reset syncState to success when queue is cleared', () => {
			syncState.set({ status: 'conflict' });
			conflictQueue.set([
				{
					key: 'test',
					base: '',
					local: '',
					remote: '',
					remoteMeta: { updatedAt: new Date().toISOString(), version: 1 },
				},
			]);
			// Clear the queue
			conflictQueue.set([]);
			// syncState should transition to success
			expect(get(syncState).status).toBe('success');
		});

		it('should not change syncState if not in conflict status', () => {
			syncState.set({ status: 'idle' });
			conflictQueue.set([]);
			expect(get(syncState).status).toBe('idle');
		});
	});

	// ── UI state stores ────────────────────────────────────────────────────────

	describe('UI state stores', () => {
		describe('activeTopicKey', () => {
			it('should initialize as null', () => {
				expect(get(activeTopicKey)).toBeNull();
			});

			it('should accept topic key', () => {
				activeTopicKey.set('my-topic');
				expect(get(activeTopicKey)).toBe('my-topic');
			});
		});

		describe('isMobile', () => {
			it('should initialize as false', () => {
				expect(get(isMobile)).toBe(false);
			});

			it('should accept boolean value', () => {
				isMobile.set(true);
				expect(get(isMobile)).toBe(true);
			});
		});

		describe('editorMode', () => {
			it('should initialize as edit', () => {
				expect(get(editorMode)).toBe('edit');
			});

			it('should accept explorer mode', () => {
				editorMode.set('explorer');
				expect(get(editorMode)).toBe('explorer');
			});
		});

		describe('collapseSidebar', () => {
			it('should be true when editorMode is edit', () => {
				editorMode.set('edit');
				expect(get(collapseSidebar)).toBe(true);
			});

			it('should be false when editorMode is explorer', () => {
				editorMode.set('explorer');
				expect(get(collapseSidebar)).toBe(false);
			});

			it('should update reactively when editorMode changes', () => {
				editorMode.set('edit');
				expect(get(collapseSidebar)).toBe(true);
				editorMode.set('explorer');
				expect(get(collapseSidebar)).toBe(false);
			});
		});

		describe('chatOpen', () => {
			it('should initialize as false', () => {
				expect(get(chatOpen)).toBe(false);
			});

			it('should accept boolean value', () => {
				chatOpen.set(true);
				expect(get(chatOpen)).toBe(true);
			});
		});

		describe('chatMessages', () => {
			it('should initialize as empty array', () => {
				expect(get(chatMessages)).toEqual([]);
			});

			it('should accept messages', () => {
				chatMessages.set([
					{ id: '1', role: 'user', content: 'Hello' },
					{ id: '2', role: 'assistant', content: 'Hi there!' },
				]);
				expect(get(chatMessages)).toHaveLength(2);
			});
		});

		describe('mcpOpen', () => {
			it('should initialize as false', () => {
				expect(get(mcpOpen)).toBe(false);
			});

			it('should accept boolean value', () => {
				mcpOpen.set(true);
				expect(get(mcpOpen)).toBe(true);
			});
		});

		describe('initialising', () => {
			it('should initialize as true', () => {
				expect(get(initialising)).toBe(true);
			});

			it('should accept boolean value', () => {
				initialising.set(false);
				expect(get(initialising)).toBe(false);
			});
		});
	});

	// ── Filter stores with localStorage persistence ────────────────────────────

	describe('Filter stores with localStorage persistence', () => {
		describe('listActiveType', () => {
			it('should persist to localStorage', () => {
				listActiveType.set('character');
				expect(localStorage.getItem('lore:filter:activeType')).toBe(
					JSON.stringify('character')
				);
			});

			it('should read persisted value after set', () => {
				listActiveType.set('location');
				// The store should have the value
				expect(get(listActiveType)).toBe('location');
			});
		});

		describe('listActiveStatus', () => {
			it('should persist to localStorage', () => {
				listActiveStatus.set('published');
				expect(localStorage.getItem('lore:filter:activeStatus')).toBe(
					JSON.stringify('published')
				);
			});
		});

		describe('listSortBy', () => {
			it('should initialize with default value', () => {
				localStorage.clear();
				expect(get(listSortBy)).toBe('name-asc');
			});

			it('should persist to localStorage', () => {
				listSortBy.set('updatedAt-desc');
				expect(localStorage.getItem('lore:filter:sortBy')).toBe(
					JSON.stringify('updatedAt-desc')
				);
			});
		});

		describe('selectedForDeletion', () => {
			it('should initialize with empty array', () => {
				localStorage.clear();
				expect(get(selectedForDeletion)).toEqual([]);
			});

			it('should persist array to localStorage', () => {
				selectedForDeletion.set(['key1', 'key2']);
				expect(localStorage.getItem('lore:filter:selectedForDeletion')).toBe(
					JSON.stringify(['key1', 'key2'])
				);
			});
		});
	});

	// ── Toast system ───────────────────────────────────────────────────────────

	describe('Toast system', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			toasts.set([]);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should initialize with empty toasts array', () => {
			expect(get(toasts)).toEqual([]);
		});

		it('should add toast when showToast is called', () => {
			showToast('Test message');
			expect(get(toasts)).toHaveLength(1);
			expect(get(toasts)[0].message).toBe('Test message');
			expect(get(toasts)[0].type).toBe('info');
		});

		it('should accept custom toast type', () => {
			showToast('Error message', 'error');
			expect(get(toasts)[0].type).toBe('error');
		});

		it('should auto-remove toast after duration', () => {
			showToast('Temporary message', 'info', 1000);
			expect(get(toasts)).toHaveLength(1);

			// Advance time past the duration
			vi.advanceTimersByTime(1000);

			expect(get(toasts)).toHaveLength(0);
		});

		it('should handle multiple toasts', () => {
			showToast('First');
			showToast('Second');
			showToast('Third');

			expect(get(toasts)).toHaveLength(3);
			expect(get(toasts).map((t) => t.message)).toEqual(['First', 'Second', 'Third']);
		});

		it('should remove only the correct toast', () => {
			showToast('First', 'info', 1000);
			showToast('Second', 'info', 5000);

			vi.advanceTimersByTime(1000);

			expect(get(toasts)).toHaveLength(1);
			expect(get(toasts)[0].message).toBe('Second');
		});

		it('should assign unique IDs to toasts', () => {
			showToast('First');
			showToast('Second');
			const [first, second] = get(toasts);
			expect(first.id).not.toBe(second.id);
		});
	});
});