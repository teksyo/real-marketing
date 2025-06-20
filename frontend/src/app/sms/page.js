"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AuthGuard from "@/components/AuthGuard";
import { smsService, leadService } from "@/services/leads";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PhoneIcon,
  ClockIcon,
  XMarkIcon,
  DocumentTextIcon,
  UserIcon,
  CalendarDaysIcon,
  HomeIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

// Pre-defined message templates
const MESSAGE_TEMPLATES = [
  {
    id: "appointment",
    name: "Schedule Appointment",
    content:
      "Hi {{name}}, this is regarding your property at {{address}}. We would like to schedule an appointment to discuss your options on {{appointment_time}}. Would this work for you?",
    fields: ["name", "address", "appointment_time"],
  },
  {
    id: "followup",
    name: "Follow Up",
    content:
      "Hello {{name}}, following up on our previous conversation about {{address}}. Are you still interested in exploring your options?",
    fields: ["name", "address"],
  },
  {
    id: "offer",
    name: "Cash Offer",
    content:
      "Hi {{name}}, we'd like to make a cash offer of ${{offer_amount}} for your property at {{address}}. This offer is valid until {{expiry_date}}. Let me know if you'd like to discuss!",
    fields: ["name", "address", "offer_amount", "expiry_date"],
  },
  {
    id: "introduction",
    name: "Introduction",
    content:
      "Hello {{name}}, I'm reaching out regarding {{address}}. We buy houses in {{city}} and would love to help you with a quick, hassle-free sale. Can we chat?",
    fields: ["name", "address", "city"],
  },
  {
    id: "thank_you",
    name: "Thank You",
    content:
      "Thank you {{name}} for your time today! As discussed, we'll send you the paperwork for {{address}} by {{follow_up_date}}. Feel free to reach out with any questions.",
    fields: ["name", "address", "follow_up_date"],
  },
];

export default function SmsPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({});

  // Message sending
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  // Template and lead selection
  const [showNewConversationModal, setShowNewConversationModal] =
    useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateFields, setTemplateFields] = useState({});
  const [selectedLead, setSelectedLead] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [creatingConversation, setCreatingConversation] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    search: "",
    page: 1,
    limit: 20,
  });

  // Lead filters
  const [leadFilters, setLeadFilters] = useState({
    search: "",
    page: 1,
    limit: 10,
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
      setError("Failed to fetch SMS conversations");
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch leads
  const fetchLeads = async () => {
    try {
      setLeadLoading(true);
      const response = await leadService.getLeads(leadFilters);
      setLeads(response.leads);
    } catch (err) {
      console.error("Error fetching leads:", err);
    } finally {
      setLeadLoading(false);
    }
  };

  // Fetch SMS stats
  const fetchStats = async () => {
    try {
      const statsData = await smsService.getStats();
      setStats(statsData);
    } catch (err) {
      console.error("Error fetching SMS stats:", err);
    }
  };

  // Load conversation messages
  const loadConversation = async (conversation) => {
    try {
      setSelectedConversation(conversation);
      const conversationData = await smsService.getConversation(
        conversation.id
      );
      setMessages(conversationData.messages || []);
    } catch (err) {
      console.error("Error loading conversation:", err);
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      setSendingMessage(true);
      await smsService.sendMessage(
        selectedConversation.id,
        newMessage,
        selectedConversation.phoneNumber
      );
      setNewMessage("");

      // Refresh conversation
      const updatedConversation = await smsService.getConversation(
        selectedConversation.id
      );
      setMessages(updatedConversation.messages || []);

      // Refresh conversations list to update latest message
      await fetchConversations();
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSendingMessage(false);
      fetchStats();
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);

    // Pre-populate fields from selected lead
    const initialFields = {};
    if (selectedLead) {
      template.fields.forEach((field) => {
        switch (field) {
          case "name":
            initialFields[field] = selectedLead.name || "";
            break;
          case "address":
            initialFields[field] = selectedLead.address || "";
            break;
          case "city":
            initialFields[field] = selectedLead.city || "";
            break;
          case "appointment_time":
            initialFields[field] = "";
            break;
          case "offer_amount":
            initialFields[field] = "";
            break;
          case "expiry_date":
            initialFields[field] = "";
            break;
          case "follow_up_date":
            initialFields[field] = "";
            break;
          default:
            initialFields[field] = "";
        }
      });
    }
    setTemplateFields(initialFields);
  };

  // Render template with filled fields
  const renderTemplate = () => {
    if (!selectedTemplate) return "";

    let content = selectedTemplate.content;
    Object.entries(templateFields).forEach(([key, value]) => {
      content = content.replace(
        new RegExp(`{{${key}}}`, "g"),
        value || `{{${key}}}`
      );
    });
    return content;
  };

  // Create new conversation with template
  const handleCreateConversation = async () => {
    if (!selectedLead || !selectedTemplate) return;
    try {
      setCreatingConversation(true);

      // Create conversation and send initial message
      const conversationData = await smsService.createConversation({
        leadId: selectedLead.id,
        phoneNumber: selectedLead?.contacts[0]?.phoneNumber || "",
        initialMessage: renderTemplate(),
      });

      // Reset modal state
      setShowNewConversationModal(false);
      setSelectedTemplate(null);
      setSelectedLead(null);
      setTemplateFields({});

      // Refresh conversations
      await fetchConversations();

      // Auto-select the new conversation
      await loadConversation(conversationData);
      setError("");
    } catch (err) {
      setError("Failed to create conversation");
    } finally {
      setCreatingConversation(false);
      fetchStats();
    }
  };

  // Update filters
  const updateFilters = (newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  };

  // Format datetime
  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
  };

  // Format relative time
  const formatRelativeTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
    return date.toLocaleDateString();
  };

  // Get field icon
  const getFieldIcon = (field) => {
    switch (field) {
      case "name":
        return <UserIcon className="h-4 w-4" />;
      case "address":
        return <HomeIcon className="h-4 w-4" />;
      case "appointment_time":
      case "expiry_date":
      case "follow_up_date":
        return <CalendarDaysIcon className="h-4 w-4" />;
      case "offer_amount":
        return <CurrencyDollarIcon className="h-4 w-4" />;
      default:
        return <DocumentTextIcon className="h-4 w-4" />;
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchStats();
  }, [filters]);

  useEffect(() => {
    if (showNewConversationModal) {
      fetchLeads();
    }
  }, [showNewConversationModal, leadFilters]);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="p-6">
          {loading && conversations.length === 0 ? (
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded mb-4"></div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="h-96 bg-gray-200 rounded"></div>
                <div className="lg:col-span-2 h-96 bg-gray-200 rounded"></div>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                      SMS Management
                    </h1>
                    <p className="text-gray-600">
                      Manage SMS conversations with your leads
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* <button
                      onClick={() => setShowNewConversationModal(true)}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      <PlusIcon className="h-5 w-5" />
                      Start Conversation
                    </button> */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-blue-900">
                          {stats.totalMessages || 0}
                        </div>
                        <div className="text-xs text-blue-700">
                          Total Messages
                        </div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-green-900">
                          {stats.activeConversations || 0}
                        </div>
                        <div className="text-xs text-green-700">
                          Active Chats
                        </div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-purple-900">
                          {stats.responseRate || "0"}%
                        </div>
                        <div className="text-xs text-purple-700">
                          Response Rate
                        </div>
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
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No SMS conversations
                    </h3>
                    <p className="text-gray-600 mb-6">
                      {filters.search
                        ? "No conversations match your search"
                        : "Start your first conversation with a lead using our templates"}
                    </p>
                    <button
                      onClick={() => setShowNewConversationModal(true)}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                    >
                      <PlusIcon className="h-5 w-5" />
                      Start Conversation
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                    {/* Conversations List */}
                    <div className="border-r border-gray-200 overflow-y-auto">
                      <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-gray-900">
                            Conversations ({conversations.length})
                          </h3>
                          <button
                            onClick={() => setShowNewConversationModal(true)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Start new conversation"
                          >
                            <PlusIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-200">
                        {conversations.map((conversation) => (
                          <button
                            key={conversation.id}
                            onClick={() => loadConversation(conversation)}
                            className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                              selectedConversation?.id === conversation.id
                                ? "bg-blue-50 border-r-2 border-blue-500"
                                : ""
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <PhoneIcon className="h-4 w-4 text-gray-400" />
                                <span className="font-medium text-gray-900">
                                  {conversation.phoneNumber}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">
                                {formatRelativeTime(conversation.updatedAt)}
                              </span>
                            </div>

                            {conversation.lead && (
                              <div className="text-sm text-gray-600 mb-1">
                                {conversation.lead.name && (
                                  <span className="font-medium">
                                    {conversation.lead.name}
                                  </span>
                                )}
                                {conversation.lead.address && (
                                  <div className="text-xs text-gray-500 truncate">
                                    {conversation.lead.address}
                                  </div>
                                )}
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
                              onClick={() =>
                                updateFilters({ page: pagination.page - 1 })
                              }
                              disabled={pagination.page <= 1}
                              className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                            >
                              Previous
                            </button>
                            <span className="text-sm text-gray-500">
                              Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                              onClick={() =>
                                updateFilters({ page: pagination.page + 1 })
                              }
                              disabled={
                                pagination.page >= pagination.totalPages
                              }
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
                                <h3 className="font-medium text-gray-900">
                                  {selectedConversation.phoneNumber}
                                </h3>
                                {selectedConversation.lead && (
                                  <p className="text-sm text-gray-600">
                                    {selectedConversation.lead.name && (
                                      <span className="font-medium">
                                        {selectedConversation.lead.name}
                                      </span>
                                    )}
                                    {selectedConversation.lead.address && (
                                      <span className="ml-2">
                                        {selectedConversation.lead.address}
                                      </span>
                                    )}
                                    <Link
                                      href={`/leads/${selectedConversation.lead.id}`}
                                      className="ml-2 text-blue-600 hover:text-blue-800"
                                    >
                                      View Lead →
                                    </Link>
                                  </p>
                                )}
                              </div>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  selectedConversation.isActive
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {selectedConversation.isActive
                                  ? "Active"
                                  : "Inactive"}
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
                                    className={`flex ${
                                      message.direction === "OUTBOUND"
                                        ? "justify-end"
                                        : "justify-start"
                                    }`}
                                  >
                                    <div
                                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                        message.direction === "OUTBOUND"
                                          ? "bg-blue-600 text-white"
                                          : "bg-gray-200 text-gray-900"
                                      }`}
                                    >
                                      <p className="text-sm">
                                        {message.content}
                                      </p>
                                      <div className="flex items-center justify-between mt-1">
                                        <p className="text-xs opacity-75">
                                          {formatDateTime(message.createdAt)}
                                        </p>
                                        {message.direction === "OUTBOUND" && (
                                          <span
                                            className={`text-xs ${
                                              message.status === "DELIVERED"
                                                ? "text-green-200"
                                                : message.status === "SENT"
                                                ? "text-blue-200"
                                                : message.status === "FAILED"
                                                ? "text-red-200"
                                                : "text-gray-200"
                                            }`}
                                          >
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
                                onKeyPress={(e) =>
                                  e.key === "Enter" && handleSendMessage()
                                }
                                disabled={!selectedConversation.isActive}
                              />
                              <button
                                onClick={handleSendMessage}
                                disabled={
                                  !newMessage.trim() ||
                                  sendingMessage ||
                                  !selectedConversation.isActive
                                }
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {sendingMessage ? "Sending..." : "Send"}
                              </button>
                            </div>
                            {!selectedConversation.isActive && (
                              <p className="text-xs text-gray-500 mt-1">
                                This conversation is inactive
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500 my-[64px]">
                          <div className="text-center">
                            <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-4" />
                            <p>Select a conversation to view messages</p>
                            <p className="text-sm mt-2">
                              Or start a new conversation with a lead
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* New Conversation Modal */}
        {showNewConversationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Start New Conversation
                  </h2>
                  <button
                    onClick={() => {
                      setShowNewConversationModal(false);
                      setSelectedTemplate(null);
                      setSelectedLead(null);
                      setTemplateFields({});
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Lead Selection */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Select Lead
                    </h3>
                    <div className="mb-4">
                      <input
                        type="text"
                        placeholder="Search leads..."
                        value={leadSearch}
                        onChange={(e) => {
                          setLeadSearch(e.target.value);
                          setLeadFilters((prev) => ({
                            ...prev,
                            search: e.target.value,
                          }));
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="border border-gray-200 rounded-lg max-h-[500px] overflow-y-auto">
                      {leadLoading ? (
                        <div className="p-4 text-center text-gray-500">
                          Loading leads...
                        </div>
                      ) : leads.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          No leads found
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {leads.map((lead) => (
                            <button
                              key={lead.id}
                              onClick={() => {
                                setSelectedLead(lead);
                                handleTemplateSelect(selectedTemplate);
                              }}
                              className={`w-full text-left p-4 hover:bg-gray-50 ${
                                selectedLead?.id === lead.id
                                  ? "bg-blue-50 border-r-2 border-blue-500"
                                  : ""
                              }`}
                            >
                              <div className="font-medium text-gray-900 flex flex-row gap-2 my-1">
                                {lead.region || "Unnamed Lead"}
                                {lead.source === "ZILLOW" && (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                                    title="Scraped from Zillow"
                                  >
                                    🏠 Zillow
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                {lead.phoneNumber}
                              </div>
                              {lead.address && (
                                <div className="text-xs text-gray-500">
                                  {lead.address}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Template Selection */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Choose Template
                    </h3>
                    <div className="space-y-3">
                      {MESSAGE_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => {
                            handleTemplateSelect(template);
                            const element = document.getElementById("template");
                            if (element) {
                              element.scrollIntoView({ behavior: "smooth" }); // Optional: smooth scrolling
                            }
                          }}
                          className={`w-full text-left p-4 border rounded-lg hover:bg-gray-50 ${
                            selectedTemplate?.id === template.id
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="font-medium text-gray-900">
                            {template.name}
                          </div>
                          <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {template.content}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Template Fields */}
                {selectedTemplate && (
                  <div
                    id="template"
                    className="mt-6 border-t border-gray-200 pt-6"
                  >
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Fill Template Fields
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {selectedTemplate.fields.map((field) => (
                        <div key={field}>
                          <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                            <div className="flex items-center gap-2">
                              {getFieldIcon(field)}
                              {field.replace("_", " ")}
                            </div>
                          </label>
                          <input
                            type={
                              field.includes("date")
                                ? "date"
                                : field.includes("time")
                                ? "datetime-local"
                                : "text"
                            }
                            value={templateFields[field] || ""}
                            onChange={(e) =>
                              setTemplateFields((prev) => ({
                                ...prev,
                                [field]: e.target.value,
                              }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder={`Enter ${field.replace("_", " ")}`}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        Message Preview
                      </h4>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {renderTemplate()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-6">
                  <button
                    onClick={() => {
                      setShowNewConversationModal(false);
                      setSelectedTemplate(null);
                      setSelectedLead(null);
                      setTemplateFields({});
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateConversation}
                    disabled={
                      !selectedLead || !selectedTemplate || creatingConversation
                    }
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingConversation
                      ? "Creating..."
                      : "Send & Start Conversation"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}
