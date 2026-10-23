/**
 * Official Meta WhatsApp Flow Starter Templates
 * Validated for Flow JSON version 3.1 / 6.0 compatible schema
 */

const STARTER_TEMPLATES = [
  {
    key: "lead_capture",
    name: "Lead Capture & Interest Form",
    category: "LEAD_GENERATION",
    categories: ["LEAD_GENERATION"],
    description: "Collect prospective customer names, email, interest category, and WhatsApp consent.",
    json_version: "3.1",
    data_api_version: "3.0",
    flow_json: {
      version: "3.1",
      data_api_version: "3.0",
      routing_model: {
        LEAD_SCREEN: []
      },
      screens: [
        {
          id: "LEAD_SCREEN",
          title: "Get In Touch",
          terminal: true,
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "Form",
                name: "lead_form",
                children: [
                  {
                    type: "TextHeading",
                    text: "Plan Your Konkan Getaway"
                  },
                  {
                    type: "TextSubheading",
                    text: "Fill out the quick details below and our concierge team will reach out with customized itineraries."
                  },
                  {
                    type: "TextInput",
                    name: "full_name",
                    label: "Full Name",
                    required: true
                  },
                  {
                    type: "TextInput",
                    name: "email",
                    label: "Email Address",
                    "input-type": "email",
                    required: true
                  },
                  {
                    type: "Dropdown",
                    name: "service_interest",
                    label: "Area of Interest",
                    required: true,
                    "data-source": [
                      { id: "beach_villa", title: "Luxury Beach Villa Stay" },
                      { id: "water_sports", title: "Water Sports & Scuba Package" },
                      { id: "food_trail", title: "Authentic Konkan Food Trail" },
                      { id: "corporate_retreat", title: "Corporate / Team Offsite" },
                      { id: "custom_itinerary", title: "Custom Family Vacation" }
                    ]
                  },
                  {
                    type: "CheckboxGroup",
                    name: "consent",
                    label: "Communication Consent",
                    required: true,
                    "data-source": [
                      {
                        id: "opt_in",
                        title: "I agree to receive customized quotes and travel updates on WhatsApp"
                      }
                    ]
                  },
                  {
                    type: "Footer",
                    label: "Submit Inquiry",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {
                        "full_name": "${form.full_name}",
                        "email": "${form.email}",
                        "service_interest": "${form.service_interest}",
                        "consent": "${form.consent}"
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    }
  },
  {
    key: "appointment_booking",
    name: "Appointment & Visit Booking",
    category: "APPOINTMENT_BOOKING",
    categories: ["APPOINTMENT_BOOKING"],
    description: "Allow guests to schedule property visits, dining tastings, or concierge calls.",
    json_version: "3.1",
    data_api_version: "3.0",
    flow_json: {
      version: "3.1",
      data_api_version: "3.0",
      routing_model: {
        BOOKING_SCREEN: []
      },
      screens: [
        {
          id: "BOOKING_SCREEN",
          title: "Schedule Your Experience",
          terminal: true,
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "Form",
                name: "booking_form",
                children: [
                  {
                    type: "TextHeading",
                    text: "Select Date & Experience"
                  },
                  {
                    type: "TextInput",
                    name: "guest_name",
                    label: "Primary Guest Name",
                    required: true
                  },
                  {
                    type: "Dropdown",
                    name: "experience_type",
                    label: "Experience Type",
                    required: true,
                    "data-source": [
                      { id: "property_visit", title: "Resort & Villa Guided Tour" },
                      { id: "tasting_session", title: "Konkani Seafood Tasting Session" },
                      { id: "safari_booking", title: "Dolphin & Coastal Safari" },
                      { id: "concierge_call", title: "Private Trip Consultation Call" }
                    ]
                  },
                  {
                    type: "DatePicker",
                    name: "preferred_date",
                    label: "Preferred Date",
                    required: true
                  },
                  {
                    type: "Dropdown",
                    name: "time_slot",
                    label: "Preferred Time Window",
                    required: true,
                    "data-source": [
                      { id: "morning", title: "Morning (09:00 AM - 12:00 PM)" },
                      { id: "afternoon", title: "Afternoon (01:00 PM - 04:00 PM)" },
                      { id: "evening", title: "Evening (04:00 PM - 07:00 PM)" }
                    ]
                  },
                  {
                    type: "TextInput",
                    name: "party_size",
                    label: "Number of Guests",
                    "input-type": "number",
                    required: false
                  },
                  {
                    type: "Footer",
                    label: "Confirm Appointment",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {
                        "guest_name": "${form.guest_name}",
                        "experience_type": "${form.experience_type}",
                        "preferred_date": "${form.preferred_date}",
                        "time_slot": "${form.time_slot}",
                        "party_size": "${form.party_size}"
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    }
  },
  {
    key: "customer_support",
    name: "Customer Support & Concierge",
    category: "CUSTOMER_SUPPORT",
    categories: ["CUSTOMER_SUPPORT"],
    description: "Structured ticket submission for booking questions, property inquiries, or billing support.",
    json_version: "3.1",
    data_api_version: "3.0",
    flow_json: {
      version: "3.1",
      data_api_version: "3.0",
      routing_model: {
        SUPPORT_SCREEN: []
      },
      screens: [
        {
          id: "SUPPORT_SCREEN",
          title: "Concierge Assistance",
          terminal: true,
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "Form",
                name: "support_form",
                children: [
                  {
                    type: "TextHeading",
                    text: "How Can We Assist You?"
                  },
                  {
                    type: "Dropdown",
                    name: "issue_category",
                    label: "Issue Category",
                    required: true,
                    "data-source": [
                      { id: "booking_change", title: "Change Booking Dates / Guests" },
                      { id: "checkin_guidance", title: "Directions & Check-in Details" },
                      { id: "billing_invoice", title: "Payment & Tax Invoice" },
                      { id: "cancellation_refund", title: "Cancellation & Refund Request" },
                      { id: "general_inquiry", title: "Other Concierge Inquiry" }
                    ]
                  },
                  {
                    type: "TextInput",
                    name: "booking_id",
                    label: "Booking Reference ID (Optional)",
                    required: false
                  },
                  {
                    type: "TextArea",
                    name: "issue_description",
                    label: "Describe your request in detail",
                    required: true
                  },
                  {
                    type: "Dropdown",
                    name: "resolution_preference",
                    label: "Preferred Contact Method",
                    required: true,
                    "data-source": [
                      { id: "whatsapp_reply", title: "Reply via WhatsApp Chat" },
                      { id: "phone_callback", title: "Urgent Phone Call from Duty Manager" },
                      { id: "email_response", title: "Email Detailed Summary" }
                    ]
                  },
                  {
                    type: "Footer",
                    label: "Submit Ticket",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {
                        "issue_category": "${form.issue_category}",
                        "booking_id": "${form.booking_id}",
                        "issue_description": "${form.issue_description}",
                        "resolution_preference": "${form.resolution_preference}"
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    }
  },
  {
    key: "customer_feedback",
    name: "Customer Feedback & Rating Survey",
    category: "SURVEY",
    categories: ["SURVEY"],
    description: "Post-checkout or service feedback survey with star rating, highlight choices, and recommendations.",
    json_version: "3.1",
    data_api_version: "3.0",
    flow_json: {
      version: "3.1",
      data_api_version: "3.0",
      routing_model: {
        FEEDBACK_SCREEN: []
      },
      screens: [
        {
          id: "FEEDBACK_SCREEN",
          title: "Your Experience Review",
          terminal: true,
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "Form",
                name: "feedback_form",
                children: [
                  {
                    type: "TextHeading",
                    text: "How Was Your KonkanTrip?"
                  },
                  {
                    type: "RadioButtonsGroup",
                    name: "overall_rating",
                    label: "Overall Rating",
                    required: true,
                    "data-source": [
                      { id: "5", title: "★★★★★ (5/5) Exceptional Experience" },
                      { id: "4", title: "★★★★☆ (4/5) Very Good" },
                      { id: "3", title: "★★★☆☆ (3/5) Average / Satisfactory" },
                      { id: "2", title: "★★☆☆☆ (2/5) Below Expectations" },
                      { id: "1", title: "★☆☆☆☆ (1/5) Poor" }
                    ]
                  },
                  {
                    type: "Dropdown",
                    name: "favorite_aspect",
                    label: "What Did You Enjoy Most?",
                    required: false,
                    "data-source": [
                      { id: "hospitality", title: "Hospitality & Staff Warmth" },
                      { id: "cuisine", title: "Authentic Local Food" },
                      { id: "cleanliness", title: "Cleanliness & Scenic Ambience" },
                      { id: "smooth_booking", title: "Seamless Automated Booking" }
                    ]
                  },
                  {
                    type: "TextArea",
                    name: "suggestions",
                    label: "Any Suggestions For Improvement?",
                    required: false
                  },
                  {
                    type: "RadioButtonsGroup",
                    name: "would_recommend",
                    label: "Would you recommend KonkanTrip to friends?",
                    required: true,
                    "data-source": [
                      { id: "yes", title: "Yes, definitely!" },
                      { id: "maybe", title: "Maybe / Not sure" },
                      { id: "no", title: "No" }
                    ]
                  },
                  {
                    type: "Footer",
                    label: "Submit Feedback",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {
                        "overall_rating": "${form.overall_rating}",
                        "favorite_aspect": "${form.favorite_aspect}",
                        "suggestions": "${form.suggestions}",
                        "would_recommend": "${form.would_recommend}"
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    }
  }
];

module.exports = {
  STARTER_TEMPLATES,
  getStarterTemplates: () => STARTER_TEMPLATES,
  getTemplateBySlug: (key) => STARTER_TEMPLATES.find(t => t.key === key || t.slug === key)
};
