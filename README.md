# Raphl (formerly RECORD-360)
Product Requirements Document (PRD)

Project Name: Raphl

Document Version: 1.0

Date: May 31, 2026

Author: Victor Manuel Acevedo y Gamaliel Leguista 




1. Executive Summary

1.1 Product Vision

RECORD 360 is a "Black Box" software designed to revolutionize construction site management by bridging the operational gap between field execution and administrative oversight. The platform transforms the traditional, passive construction logbook into an immutable, real-time data asset. By centralizing responsibilities and establishing a perpetual record of technical data, RECORD 360 ensures legal protection, operational efficiency, and financial recovery for construction companies.

1.2 Target Market

The initial focus is the construction sector in the Dominican Republic. The product is specifically designed to overcome local challenges: intermittent internet connectivity, high staff turnover, varying levels of digital literacy among field workers, and the need for legal compliance under Dominican Law No. 126-02 (Electronic Commerce and Digital Signatures).

1.3 Key Value Propositions

1.
Multimodal Capture Assistant: Frictionless field data entry using AI voice dictation, annotated photos, and quick-select tags.

2.
Offline-First Architecture: Full functionality in hostile environments (e.g., basements) with intelligent background synchronization.

3.
Legal Immutability & Traceability: Server-side timestamping and GPS metadata for every entry, ensuring legally binding audit trails.

4.
Executive Visibility: Real-time dashboards with NLP-powered risk alerts for cost and schedule control.




2. Problem Statement & Opportunity

2.1 The Problem

Construction projects suffer from fragmented communication and manual record-keeping. Field data is often recorded on paper, sent via informal channels (WhatsApp), or entered retroactively. This results in:

•
Loss of Technical Traceability: Incomplete records of why decisions were made, especially when key personnel resign.

•
Financial Leakage: Unbilled extra work or design changes due to lack of immediate, documented authorization.

•
Legal Vulnerability: Exposure to unresolved disputes and lawsuits due to informal digital records lacking legal validity.

•
Delayed Decision Making: Management receives outdated information, making their responses reactive rather than proactive.

2.2 The Opportunity

By providing a lightweight, affordable, and legally robust alternative to overly complex foreign platforms (e.g., Procore, Autodesk), RECORD 360 can capture a significant market share. The tool optimizes cash flow by accelerating change order approvals and protects companies legally by providing indisputable evidence of site conditions and work performed.




3. User Personas

Persona
Role
Core Pain Points
Key Needs
Site Resident / Field Supervisor
Feeds the system daily from the construction site.
Works under pressure in harsh conditions; hates typing long paragraphs on mobile.
Fast registration (<30s), offline mode, voice dictation, pending task alerts.
Project Supervisor / QA Team
Validates reported information and compliance.
Needs to track changes and approve work without being physically present constantly.
Digital signatures, audit trails (who edited what), robust search filters.
Project / Construction Manager
Makes strategic and financial decisions from the office.
Receives fragmented data too late; struggles to track extra costs.
Executive health dashboard, automated risk alerts, cost control visibility.
HR / Payroll Administrator
Manages personnel and legal compliance.
Inaccurate hours reported; expired safety certifications.
Clean attendance reports, document expiry alerts.







4. Functional Requirements

4.1 Administrative & Setup Module (Web/Mobile)

Based on the operational flowchart, the system must support a hierarchical setup process.

•
F1.1 Company Management: Ability to create and manage the primary company profile.

•
F1.2 Project Creation: Ability to create new construction projects and define their scope.

•
F1.3 User & Role Management: Ability to onboard personnel and assign specific roles (Admin, Manager, Supervisor, Resident).

•
F1.4 Project Assignment: Ability to assign a Site Manager (Gestor de Obra) to a specific project.

4.2 Field Operations Module (Mobile-First)

The core interface for daily use by the Site Resident, organized around "Partidas" (Work Items).

•
F2.1 Work Item (Partida) Management: Ability to view, select, and update specific construction line items (e.g., "Slab pour level 3").

•
F2.2 Multimodal Log Entry:

•
Voice Dictation: AI-powered transcription of voice notes, with automatic categorization and cost tagging.

•
Photo Evidence: Ability to capture photos, draw annotations on them, and link them to plans.

•
Video Evidence: Ability to capture and upload short video clips.

•
Text Notes: Standard text input for detailed observations.



•
F2.3 Progress Tracking: Ability to input and visualize the completion percentage of a specific Work Item.

•
F2.4 Consolidated Record Viewer: A chronological feed of all notes, photos, and videos associated with a Work Item.

4.3 Data Integrity & Offline Capabilities (Core Infrastructure)

These features are critical for the "Black Box" concept and legal validity.

•
F3.1 Offline-First Architecture: The mobile app must function fully without an internet connection, storing data locally.

•
F3.2 Intelligent Synchronization: Automatic background sync to the cloud when a stable connection is detected, with basic conflict resolution (last-edit wins).

•
F3.3 Server-Side Timestamping: Every entry must be stamped with a network-validated time, independent of the device clock.

•
F3.4 GPS Geotagging: Every entry and media file must automatically embed GPS coordinates to prove physical presence on site.

•
F3.5 Immutability (Append-Only): Once saved, records cannot be deleted or overwritten. Corrections must be logged as new, linked entries, preserving the original.

4.4 Management & Executive Dashboard (Web-First)

Tools for office-based decision-makers.

•
F4.1 Health Dashboard: A high-level view summarizing project progress, delays, and incidents using a traffic-light system (Red/Yellow/Green).

•
F4.2 NLP Risk Detection: Automated highlighting of log entries mentioning critical keywords (e.g., "accident", "delay", "material shortage").

•
F4.3 Change Order Module: Digital workflow for field users to request, and supervisors to pre-authorize, extra work or design changes.

•
F4.4 Advanced Digital Signatures: Integration of legally binding digital signatures for report approvals and change orders.

•
F4.5 Export & Reporting: Ability to generate ISO-compliant PDF reports containing timestamped, geotagged, and signed logs for audits.




5. Non-Functional Requirements

•
NF1 Usability (Zero Friction): The mobile interface must require no more than 3 clicks to log an event. The average time to create a log entry must be under 30 seconds.

•
NF2 Reliability: The offline synchronization success rate must be 99.9% without data loss or corruption.

•
NF3 Legal Compliance: The system architecture and digital signature implementation must comply with Dominican Law No. 126-02.

•
NF4 Performance: The mobile app must be lightweight to run on mid-range devices typical of field workers, with minimal battery drain during background sync.

•
NF5 Scalability: The database architecture must handle thousands of daily multimedia uploads per project without degradation in dashboard load times.




6. System Architecture & Flow

6.1 User Flow (Based on Diagram)

1.
Start $\rightarrow$ Login

2.
Company $\rightarrow$ Select/Manage Company

3.
Project Selection $\rightarrow$ Choose active project

4.
Site Manager Assignment $\rightarrow$ Ensure proper authorization

5.
Enter/View Work Items (Partidas) $\rightarrow$ Navigate to specific task

6.
Log Actions:

•
Enter Notes

•
Enter Photos

•
Enter Videos



7.
View Progress / View Records $\rightarrow$ Review consolidated data

6.2 Data Hierarchy

•
Company

•
Project

•
Work Item (Partida)

•
Log Entry (Note, Photo, Video)

•
Metadata: Timestamp, GPS, User ID, Signature Status, Immutable Hash












7. Out of Scope for MVP

To ensure a focused and timely launch, the following features are explicitly excluded from the Minimum Viable Product:

•
Complex Conflict Resolution: If two users edit the same offline record, the system will use a simple "last edit prevails" logic rather than complex merging.

•
Full Forensic Audit Log UI: While data will be immutable backend, a complex UI showing every view/read action is deferred.

•
Automated Weekly PDF Backups: Automatic email generation of signed PDFs to the project owner will be handled manually in the MVP.

•
Deep ERP Integration: Direct integration with complex administrative or accounting software (e.g., SAP) is deferred.




8. Success Metrics (KPIs)

8.1 Field Adoption & Usability

•
Average Registration Time: $< 30$ seconds per entry.

•
Multimodal Usage Rate: $> 70%$ of entries using voice dictation or photos instead of manual typing.

•
Offline Sync Success: $99.9%$ of offline records successfully synced to the cloud.

8.2 Business & Financial Impact

•
Change Order Cycle Time: $50%$ reduction in time from field request to digital pre-authorization compared to paper processes.

•
Recovered Costs Volume: Total monetary value of extra work successfully documented and billed through the app.

8.3 Data Integrity

•
Legal Compliance Rate: $100%$ of exported logs contain intact timestamps, GPS coordinates, and unaltered digital signatures.




9. Design Guidelines

•
Typography: Futura / IMPACT / Leelawadee.

•
Color Palette: Grayscale base (specific scale to be selected), with high-contrast accent colors (Red/Yellow/Green) for the dashboard traffic-light system.

•
Aesthetic: Mobile-first, utilitarian, high legibility in bright sunlight, large touch targets for users wearing gloves or working in dusty environments.




