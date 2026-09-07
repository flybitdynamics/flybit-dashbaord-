/**
 * The values the ORIGINAL documents contained. Filling a template with these
 * must reproduce the original exactly — that is what both verification
 * scripts assert.
 */
export const COMPANY = {
  companyName: "Flybit Dynamics Private Limited",
  companyShortName: "Flybit Dynamics Pvt. Ltd.",
  companyAddress: "511, Satyamev Eminence, Science City Rd, Sola, Ahmedabad, 380006",
  companyAddressLine1: "511, Satyamev Eminence, Sola, Science City Road,",
  companyAddressLine2: "Ahmedabad, Gujarat - 380060",
  companyEmail: "flybitdynamics@gmail.com",
  companyPhone: "+91 92274 28262",
  nodalPhone: "+91 9227428262",
  signatoryTitle: "Director",
  coordinatorName: "Vivekkumar Patel",
  coordinatorPhone: "+91 92274 28262",
  pilotName: "Shivam Patel",
  pilotQualification: "Technical Head",
  previousPermissionNo: "AV-22031/106/2025-SDIT-MOCA",
  uin: "Mentioned in PDF",
  maxHeight: "120",
  operatingRadius: "200",
  operatingTime: "15-20 mins",
  weather: "Normal",
  operationType: "VLOS",
  city: "Vadodara",
  venueAddress:
    "Reliance Foundation School Ground, New IPCL Rd, Subhanpura, Vadodara, Gujarat 390023",
  coordinates: "22.323547, 73.156645",
  droneCount: "150",
  showDateLong: "6th Sep, 2026",
  showTimeRange: "8:30 PM to 9:30 PM",
  showWindow: "8:30 PM – 09:30 PM, 6th Sep, 2026",
  showLabel: "Trial Show",
};

export const JOBS = [
  {
    template: "moca-letter.docx",
    source: "moca-letter.source.docx",
    data: { signatoryName: "Vivekkumar Patel", letterDate: "29th August, 2026" },
  },
  {
    template: "undertaking.docx",
    source: "undertaking.source.docx",
    data: { signatoryName: "Vivekkumar Patel", letterDate: "29th August, 2026" },
  },
  {
    template: "annexures.docx",
    source: "annexures.source.docx",
    // The annexures say "Vivek Patel"; the letters say "Vivekkumar Patel".
    data: { signatoryName: "Vivek Patel", letterDateShort: "29-Aug-2026" },
  },
];
