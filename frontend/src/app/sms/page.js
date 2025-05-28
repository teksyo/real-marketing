'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { smsService, leadService } from '@/services/leads';
import { 
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PhoneIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function SmsPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({});
  
  // Message sending
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    search: '',
    page: 1,
    limit: 20
  });

  // SMS Stats
  const [stats, setStats] = useState({});

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await smsService.getConversations(filters);
      setConversations(response.conversations);
      setPagination(response.pagination);
    } catch (err) {
      setError('Failed to fetch SMS conversations');
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch SMS stats
  const fetchStats = async () => {
    try {
      const statsData = await smsService.getStats();
      setStats(statsData);
    } catch (err) {
      console.error('Error fetching SMS stats:', err);
    }
  };

  // Load conversation messages
  const loadConversation = async (conversation) => {
    try {
      setSelectedConversation(conversation);
      const conversationData = await smsService.getConversation(conversation.id);
      setMessages(conversationData.messages || []);
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    try {
      setSendingMessage(true);
      await smsService.sendMessage(selectedConversation.id, newMessage);
      setNewMessage('');
      
      // Refresh conversation
      const updatedConversation = await smsService.getConversation(selectedConversation.id);
      setMessages(updatedConversation.messages || []);
      
      // Refresh conversations list to update latest message
      await fetchConversations();
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  // Update filters
  const updateFilters = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  // Format datetime
  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  // Format relative time
  const formatRelativeTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
    return date.toLocaleDateString();
  };

  useEffect(() => {
    fetchConversations();
    fetchStats();
  }, [filters]);

  if (loading && conversations.length === 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-96 bg-gray-200 rounded"></div>
              <div className="lg:col-span-2 h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">SMS Management</h1>
              <p className="text-gray-600">Manage SMS conversations with your leads</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-900">{stats.totalMessages || 0}</div>
                  <div className="text-xs text-blue-700">Total Messages</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-900">{stats.activeConversations || 0}</div>
                  <div className="text-xs text-green-700">Active Chats</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-purple-900">{stats.responseRate || '0'}%</div>
                  <div className="text-xs text-purple-700">Response Rate</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations by phone number or lead..."
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {conversations.length === 0 ? (
            <div className="text-center py-12">
              <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No SMS conversations</h3>
              <p className="text-gray-600 mb-6">
                {filters.search 
                  ? 'No conversations match your search' 
                  : 'Start conversations with your leads from their individual pages'
                }
              </p>
              <Link
                href="/leads"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
              >
                <PlusIcon className="h-5 w-5" />
                View Leads
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 h-96">
              {/* Conversations List */}
              <div className="border-r border-gray-200 overflow-y-auto">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900">Conversations ({conversations.length})</h3>
                </div>
                <div className="divide-y divide-gray-200">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => loadConversation(conversation)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                        selectedConversation?.id === conversation.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <PhoneIcon className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{conversation.phoneNumber}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {formatRelativeTime(conversation.updatedAt)}
                        </span>
                      </div>
                      
                      {conversation.lead && (
                        <div className="text-sm text-gray-600 mb-1">
                          {conversation.lead.address || `ZIP: ${conversation.lead.zipCode}`}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {conversation._count?.messages || 0} messages
                        </span>
                        {conversation.messages?.[0] && (
                          <div className="text-xs text-gray-500 truncate max-w-32">
                            {conversation.messages[0].content}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                
                {/* Pagination for conversations */}
                {pagination.totalPages > 1 && (
                  <div className="p-4 border-t border-gray-200">
                    <div className="flex justify-between">
                      <button
                        onClick={() => updateFilters({ page: pagination.page - 1 })}
                        disabled={pagination.page <= 1}
                        className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-500">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <button
                        onClick={() => updateFilters({ page: pagination.page + 1 })}
                        disabled={pagination.page >= pagination.totalPages}
                        className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Messages Area */}
              <div className="lg:col-span-2 flex flex-col">
                {selectedConversation ? (
                  <>
                    {/* Conversation Header */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">{selectedConversation.phoneNumber}</h3>
                          {selectedConversation.lead && (
                            <p className="text-sm text-gray-600">
                              {selectedConversation.lead.address || `Lead #${selectedConversation.lead.id}`}
                              <Link 
                                href={`/leads/${selectedConversation.lead.id}`}
                                className="ml-2 text-blue-600 hover:text-blue-800"
                              >
                                View Lead →
                              </Link>
                            </p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          selectedConversation.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {selectedConversation.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4">
                      {messages.length > 0 ? (
                        <div className="space-y-4">
                          {messages.map((message) => (
                            <div
                              key={message.id}
                              className={`flex ${message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                  message.direction === 'OUTBOUND'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-900'
                                }`}
                              >
                                <p className="text-sm">{message.content}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-xs opacity-75">
                                    {formatDateTime(message.createdAt)}
                                  </p>
                                  {message.direction === 'OUTBOUND' && (
                                    <span className={`text-xs ${
                                      message.status === 'DELIVERED' ? 'text-green-200' :
                                      message.status === 'SENT' ? 'text-blue-200' :
                                      message.status === 'FAILED' ? 'text-red-200' :
                                      'text-gray-200'
                                    }`}>
                                      {message.status}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-gray-500 mt-8">
                          <ChatBubbleLeftRightIcon className="h-8 w-8 mx-auto mb-2" />
                          <p>No messages in this conversation yet</p>
                        </div>
                      )}
                    </div>

                    {/* Message Input */}
                    <div className="p-4 border-t border-gray-200">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type your message..."
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                          disabled={!selectedConversation.isActive}
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={!newMessage.trim() || sendingMessage || !selectedConversation.isActive}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sendingMessage ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                      {!selectedConversation.isActive && (
                        <p className="text-xs text-gray-500 mt-1">This conversation is inactive</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-4" />
                      <p>Select a conversation to view messages</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
} 