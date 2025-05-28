'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { leadService, smsService, LEAD_STATUSES, LEAD_PRIORITIES, ACTIVITY_TYPES } from '@/services/leads';
import { 
  ArrowLeftIcon, 
  PencilIcon, 
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  TagIcon,
  MapPinIcon,
  UserIcon,
  PhoneIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = parseInt(params.id);
  
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  
  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusNotes, setStatusNotes] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  
  // Note adding
  const [addingNote, setAddingNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  
  // SMS conversation
  const [smsConversations, setSmsConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Fetch lead data
  const fetchLead = async () => {
    try {
      setLoading(true);
      const leadData = await leadService.getLeadById(leadId);
      setLead(leadData);
      
      // Fetch activities
      const activitiesData = await leadService.getLeadActivities(leadId);
      setActivities(activitiesData.activities || []);
      
      // Set SMS conversations
      setSmsConversations(leadData.smsConversations || []);
      if (leadData.smsConversations?.length > 0 && activeTab === 'sms') {
        setSelectedConversation(leadData.smsConversations[0]);
        setMessages(leadData.smsConversations[0].messages || []);
      }
    } catch (err) {
      setError('Failed to fetch lead details');
      console.error('Error fetching lead:', err);
    } finally {
      setLoading(false);
    }
  };

  // Update lead status
  const handleStatusUpdate = async () => {
    try {
      setUpdatingStatus(true);
      await leadService.updateLeadStatus(leadId, newStatus, statusNotes);
      setShowStatusModal(false);
      setStatusNotes('');
      setNewStatus('');
      await fetchLead(); // Refresh data
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    try {
      setAddingNote(true);
      await leadService.addNote(leadId, newNote);
      setNewNote('');
      await fetchLead(); // Refresh data
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  // Send SMS message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    try {
      setSendingMessage(true);
      await smsService.sendMessage(selectedConversation.id, newMessage);
      setNewMessage('');
      // Refresh conversation
      const updatedConversation = await smsService.getConversation(selectedConversation.id);
      setMessages(updatedConversation.messages || []);
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    const statusObj = LEAD_STATUSES.find(s => s.value === status);
    return statusObj ? statusObj.color : 'bg-gray-100 text-gray-800';
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    const priorityObj = LEAD_PRIORITIES.find(p => p.value === priority);
    return priorityObj ? priorityObj.color : 'bg-gray-100 text-gray-800';
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Format datetime
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  useEffect(() => {
    fetchLead();
  }, [leadId]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-32 bg-gray-200 rounded mb-4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !lead) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-red-400 text-xl mb-4">Error</div>
            <p className="text-gray-600 mb-6">{error || 'Lead not found'}</p>
            <Link
              href="/leads"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              Back to Leads
            </Link>
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
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/leads"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              Back to Leads
            </Link>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {lead.address || `Lead #${lead.id}`}
              </h1>
              <div className="flex items-center gap-4 mt-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(lead.status)}`}>
                  {LEAD_STATUSES.find(s => s.value === lead.status)?.label || lead.status}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(lead.priority)}`}>
                  {LEAD_PRIORITIES.find(p => p.value === lead.priority)?.label || lead.priority}
                </span>
                <span className="text-sm text-gray-500">
                  Created {formatDate(lead.createdAt)}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowStatusModal(true);
                  setNewStatus(lead.status);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <TagIcon className="h-4 w-4" />
                Update Status
              </button>
              <Link
                href={`/leads/${leadId}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <PencilIcon className="h-4 w-4" />
                Edit Lead
              </Link>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: UserIcon },
              { id: 'sms', label: 'SMS', icon: ChatBubbleLeftRightIcon, count: smsConversations.length },
              { id: 'appointments', label: 'Appointments', icon: CalendarDaysIcon, count: lead.appointments?.length },
              { id: 'activity', label: 'Activity', icon: ClockIcon, count: activities.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-1 py-4 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lead Information */}
                <div className="lg:col-span-2">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Lead Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Address</label>
                      <p className="text-gray-900">{lead.address || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">ZIP Code</label>
                      <p className="text-gray-900">{lead.zipCode}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Price</label>
                      <p className="text-gray-900">{lead.price ? `$${lead.price}` : 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Bedrooms</label>
                      <p className="text-gray-900">{lead.beds || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Last Contact</label>
                      <p className="text-gray-900">{formatDate(lead.lastContactDate)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Next Follow-up</label>
                      <p className="text-gray-900">{formatDate(lead.nextFollowUpDate)}</p>
                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="mt-6">
                    <h4 className="text-md font-medium text-gray-900 mb-3">Notes</h4>
                    {lead.notes ? (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <pre className="whitespace-pre-wrap text-sm text-gray-700">{lead.notes}</pre>
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">No notes added yet</p>
                    )}
                    
                    {/* Add Note Form */}
                    <div className="mt-4">
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a note..."
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={!newNote.trim() || addingNote}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingNote ? 'Adding...' : 'Add Note'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sidebar */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
                  <div className="space-y-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-900">{smsConversations.length}</div>
                      <div className="text-sm text-blue-700">SMS Conversations</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-900">{lead.appointments?.length || 0}</div>
                      <div className="text-sm text-green-700">Appointments</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-900">{activities.length}</div>
                      <div className="text-sm text-purple-700">Total Activities</div>
                    </div>
                  </div>

                  {/* Contacts */}
                  {lead.contacts?.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-md font-medium text-gray-900 mb-3">Contacts</h4>
                      <div className="space-y-2">
                        {lead.contacts.map((contact) => (
                          <div key={contact.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <UserIcon className="h-5 w-5 text-gray-400" />
                            <div>
                              <div className="font-medium text-gray-900">{contact.name}</div>
                              <div className="text-sm text-gray-500 flex items-center gap-1">
                                <PhoneIcon className="h-4 w-4" />
                                {contact.phoneNumber}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SMS Tab */}
          {activeTab === 'sms' && (
            <div className="p-6">
              {smsConversations.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Conversations List */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Conversations</h3>
                    <div className="space-y-2">
                      {smsConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          onClick={() => {
                            setSelectedConversation(conversation);
                            setMessages(conversation.messages || []);
                          }}
                          className={`w-full text-left p-3 rounded-lg border ${
                            selectedConversation?.id === conversation.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-medium text-gray-900">{conversation.phoneNumber}</div>
                          <div className="text-sm text-gray-500">
                            {conversation.messages?.length || 0} messages
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="lg:col-span-2">
                    {selectedConversation ? (
                      <>
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                          Messages - {selectedConversation.phoneNumber}
                        </h3>
                        
                        {/* Messages List */}
                        <div className="h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 mb-4">
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
                                    <p>{message.content}</p>
                                    <p className="text-xs mt-1 opacity-75">
                                      {formatDateTime(message.createdAt)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-center">No messages yet</p>
                          )}
                        </div>

                        {/* Send Message Form */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Type your message..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={!newMessage.trim() || sendingMessage}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {sendingMessage ? 'Sending...' : 'Send'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500">Select a conversation to view messages</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No SMS conversations</h3>
                  <p className="text-gray-600 mb-6">Start a conversation with this lead</p>
                  <button className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                    <PlusIcon className="h-5 w-5" />
                    Start Conversation
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Appointments Tab */}
          {activeTab === 'appointments' && (
            <div className="p-6">
              {lead.appointments?.length > 0 ? (
                <div className="space-y-4">
                  {lead.appointments.map((appointment) => (
                    <div key={appointment.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{appointment.title}</h4>
                          <p className="text-sm text-gray-600">{appointment.description}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {formatDateTime(appointment.datetime)}
                            {appointment.location && ` • ${appointment.location}`}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          appointment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          appointment.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                          appointment.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {appointment.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CalendarDaysIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments</h3>
                  <p className="text-gray-600 mb-6">Schedule an appointment with this lead</p>
                  <button className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                    <PlusIcon className="h-5 w-5" />
                    Schedule Appointment
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="p-6">
              {activities.length > 0 ? (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <ClockIcon className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">
                            {ACTIVITY_TYPES[activity.type] || activity.type}
                          </h4>
                          <span className="text-sm text-gray-500">
                            {formatDateTime(activity.createdAt)}
                          </span>
                        </div>
                        <p className="text-gray-600 mt-1">{activity.description}</p>
                        {activity.user && (
                          <p className="text-xs text-gray-500 mt-1">by {activity.user.email}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No activity yet</h3>
                  <p className="text-gray-600">Activity will appear here as you interact with this lead</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Update Modal */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Update Lead Status</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    {LEAD_STATUSES.map(status => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    rows={3}
                    placeholder="Add any notes about this status change..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStatusUpdate}
                  disabled={updatingStatus || !newStatus}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingStatus ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 