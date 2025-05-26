'use client';

const LeadsList = ({ leads, loading }) => {
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!leads?.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No leads found for this region
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-auto max-h-[600px]">
      {leads.map((lead, index) => (
        <div
          key={lead.id || index}
          className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow border border-gray-100"
        >
          {/* Property Info */}
          <div className="border-b border-gray-100 pb-3">
            <h3 className="font-medium text-gray-900">{lead.address}</h3>
            <div className="mt-2 text-sm text-gray-600 flex gap-4">
              <span>Price: {lead.price}</span>
              <span>Beds: {lead.beds}</span>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mt-3">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Contacts:</h4>
            {lead.contacts && lead.contacts.length > 0 ? (
              <div className="space-y-2">
                {lead.contacts.map((contact, idx) => (
                  <div key={idx} className="text-sm bg-gray-50 p-2 rounded">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{contact.name || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">{contact.type}</span>
                    </div>
                    <div className="mt-1 text-gray-600">
                      {contact.phoneNumber && (
                        <div className="flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                          </svg>
                          <a href={`tel:${contact.phoneNumber}`} className="text-blue-600 hover:text-blue-800">
                            {contact.phoneNumber}
                          </a>
                        </div>
                      )}
                      {contact.company && (
                        <div className="text-xs text-gray-500 mt-1">
                          {contact.company}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No contact information available</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default LeadsList; 