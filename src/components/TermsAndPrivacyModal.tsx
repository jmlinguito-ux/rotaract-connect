import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import RotaryWheel from './RotaryWheel';

interface TermsAndPrivacyModalProps {
  visible: boolean;
  initialTab?: 'terms' | 'privacy';
  onClose: () => void;
  onAccept?: () => void;
}

export default function TermsAndPrivacyModal({
  visible,
  initialTab = 'terms',
  onClose,
  onAccept,
}: TermsAndPrivacyModalProps) {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);

  React.useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeContainer}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <RotaryWheel size={28} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Rotaract Connect</Text>
                  <Text style={styles.modalSubtitle}>District 3800 • Legal Terms & Privacy</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Tab Selector */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'terms' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('terms')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={activeTab === 'terms' ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'terms' && styles.tabTextActive,
                    ]}
                  >
                    User Agreement
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'privacy' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('privacy')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color={activeTab === 'privacy' ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'privacy' && styles.tabTextActive,
                    ]}
                  >
                    Privacy Policy
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable Content */}
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={styles.scrollBody}
              showsVerticalScrollIndicator={true}
            >
              {activeTab === 'terms' ? (
                <TermsContent />
              ) : (
                <PrivacyContent />
              )}
            </ScrollView>

            {/* Footer Actions */}
            <View style={styles.footer}>
              {onAccept ? (
                <View style={styles.acceptRow}>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={onClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.declineBtnText}>Close</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => {
                      onAccept();
                      onClose();
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.acceptBtnText}>I Agree & Accept</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.fullCloseBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.fullCloseBtnText}>Close</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function TermsContent() {
  return (
    <View style={styles.tabContent}>
      {/* Document Meta Banner */}
      <View style={styles.metaCard}>
        <Text style={styles.docTitle}>ROTARACT CONNECT</Text>
        <Text style={styles.docSubtitle}>USER AGREEMENT AND TERMS OF USE</Text>
        <View style={styles.metaDivider} />
        <Text style={styles.metaLine}><Text style={styles.bold}>Effective Date:</Text> August 18, 2026</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Last Updated:</Text> August 18, 2026</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Application:</Text> Rotaract Connect mobile application and associated services</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Operator:</Text> Rotaract District 3800</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Address:</Text> District 3800, Metro Manila & Rizal, Philippines</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Contact Email:</Text> support@rotaract3800.org</Text>
      </View>

      <Text style={styles.sectionHeader}>1. ACCEPTANCE OF THIS AGREEMENT</Text>
      <Text style={styles.paragraph}>
        Welcome to <Text style={styles.bold}>Rotaract Connect</Text> (“Rotaract Connect,” the “App,” “Platform,” “Service,” “we,” “us,” or “our”).
      </Text>
      <Text style={styles.paragraph}>
        These User Agreement and Terms of Use (“Terms”) constitute a legally binding agreement between you (“you,” “your,” “User”) and <Text style={styles.bold}>Rotaract District 3800</Text> (“Operator”) concerning your access to and use of Rotaract Connect.
      </Text>
      <Text style={styles.paragraph}>By:</Text>
      <BulletItem text="1. downloading, installing, accessing, or using the App;" />
      <BulletItem text="2. creating an account;" />
      <BulletItem text="3. signing in to an existing account;" />
      <BulletItem text="4. submitting information through the App;" />
      <BulletItem text="5. sending or receiving messages through the App;" />
      <BulletItem text="6. uploading photographs, documents, files, or other content;" />
      <BulletItem text="7. registering for or participating in an event through the App; or" />
      <BulletItem text="8. otherwise using any feature of the Service," />
      <Text style={styles.paragraph}>
        you acknowledge that you have read, understood, and agreed to these Terms.
      </Text>
      <View style={styles.alertBox}>
        <Ionicons name="alert-circle" size={18} color={colors.danger} />
        <Text style={styles.alertBoxText}>
          IF YOU DO NOT AGREE TO THESE TERMS, DO NOT CREATE AN ACCOUNT, ACCESS, OR USE THE APP.
        </Text>
      </View>
      <Text style={styles.paragraph}>
        Your continued use of the App after an updated version of these Terms becomes effective constitutes acceptance of the updated Terms to the extent permitted by applicable law.
      </Text>

      <Text style={styles.sectionHeader}>2. DESCRIPTION OF THE SERVICE</Text>
      <Text style={styles.paragraph}>
        Rotaract Connect is intended to provide authorized members, officers, administrators, and other approved users of participating Rotaract organizations with digital tools for organizational communication and coordination.
      </Text>
      <Text style={styles.paragraph}>Depending on the user's permissions and features enabled by the Operator, the App may provide:</Text>
      <BulletItem text="• user registration and authentication;" />
      <BulletItem text="• member profiles and organizational information;" />
      <BulletItem text="• announcements;" />
      <BulletItem text="• events and calendars;" />
      <BulletItem text="• event registration;" />
      <BulletItem text="• event-related communications;" />
      <BulletItem text="• direct and group messaging;" />
      <BulletItem text="• archived event group conversations;" />
      <BulletItem text="• push notifications;" />
      <BulletItem text="• member directories;" />
      <BulletItem text="• organizational documents;" />
      <BulletItem text="• payment-related information or records;" />
      <BulletItem text="• invoice or receipt uploads;" />
      <BulletItem text="• expense-related information;" />
      <BulletItem text="• administrative workflows;" />
      <BulletItem text="• photographs and media uploads;" />
      <BulletItem text="• venue and location information;" />
      <BulletItem text="• account and access management;" />
      <BulletItem text="• reporting and moderation functions; and other features introduced by the Operator." />
      <Text style={styles.paragraph}>
        The Operator may add, remove, modify, suspend, or discontinue features at any time, subject to applicable law.
      </Text>

      <Text style={styles.sectionHeader}>3. ELIGIBILITY</Text>
      <Text style={styles.paragraph}>You may use Rotaract Connect only if:</Text>
      <BulletItem text="1. you are legally capable of entering into this Agreement;" />
      <BulletItem text="2. you provide truthful and accurate information;" />
      <BulletItem text="3. you are authorized to use the relevant organizational features;" />
      <BulletItem text="4. your use does not violate applicable law;" />
      <BulletItem text="5. you comply with these Terms; and" />
      <BulletItem text="6. you satisfy any additional eligibility requirements imposed by the participating organization." />
      <Text style={styles.paragraph}>
        If you are under the applicable age of majority or otherwise legally unable to enter into this Agreement independently, you may use the App only where permitted by applicable law and with the involvement or consent of a parent, guardian, or other legally authorized representative when required.
      </Text>
      <Text style={styles.paragraph}>
        The Operator may require additional verification for particular features.
      </Text>

      <Text style={styles.sectionHeader}>4. ORGANIZATIONAL MEMBERSHIP AND AUTHORIZATION</Text>
      <Text style={styles.paragraph}>
        Rotaract Connect may be restricted to members or authorized participants of participating organizations.
      </Text>
      <Text style={styles.paragraph}>The Operator or authorized organizational administrators may determine:</Text>
      <BulletItem text="• whether a person may create an account;" />
      <BulletItem text="• which organization or club a user belongs to;" />
      <BulletItem text="• what roles and permissions a user receives;" />
      <BulletItem text="• what information a user may access;" />
      <BulletItem text="• whether a user may participate in particular events or groups;" />
      <BulletItem text="• whether a user's account must be verified;" />
      <BulletItem text="• whether access should be suspended or revoked." />
      <Text style={styles.paragraph}>
        Having an account does not guarantee membership in any Rotaract organization.
      </Text>
      <Text style={styles.paragraph}>
        Likewise, access to the App does not independently establish, create, modify, or guarantee membership, officer status, employment, appointment, financial entitlement, or any other legal relationship with a Rotaract organization.
      </Text>

      <Text style={styles.sectionHeader}>5. ACCOUNT REGISTRATION</Text>
      <Text style={styles.paragraph}>
        You agree to provide accurate, current, and complete information when registering. You must not:
      </Text>
      <BulletItem text="• create an account using another person's identity;" />
      <BulletItem text="• impersonate another person;" />
      <BulletItem text="• create an account using fraudulent information;" />
      <BulletItem text="• deliberately provide misleading organizational information;" />
      <BulletItem text="• create multiple accounts to evade restrictions;" />
      <BulletItem text="• use an account belonging to another person without authorization; or" />
      <BulletItem text="• allow another person to use your credentials where doing so creates a security or authorization risk." />
      <Text style={styles.paragraph}>
        You are responsible for keeping your account information accurate. If your information changes, you should update it as soon as reasonably practicable.
      </Text>

      <Text style={styles.sectionHeader}>6. ACCOUNT SECURITY</Text>
      <Text style={styles.paragraph}>
        You are responsible for protecting your password, verification codes, authentication credentials, device, access tokens, recovery mechanisms, and other authentication information.
      </Text>
      <Text style={styles.paragraph}>
        You must immediately notify the Operator if you believe your account has been compromised, someone has accessed your account without authorization, your credentials have been disclosed, your authenticated device has been lost/stolen, or there has been another security incident.
      </Text>
      <Text style={styles.paragraph}>
        The Operator may temporarily suspend an account or require additional verification where reasonably necessary to protect the Service or its users.
      </Text>

      <Text style={styles.sectionHeader}>7. USER RESPONSIBILITY</Text>
      <Text style={styles.paragraph}>
        You are solely responsible for your use of the App and for content and information you submit through it. You agree to use the App responsibly, lawfully, respectfully, and only for legitimate organizational or personal purposes consistent with the purpose of the Service.
      </Text>
      <Text style={styles.paragraph}>You must not use the App to:</Text>
      <BulletItem text="1. violate any applicable law or regulation;" />
      <BulletItem text="2. commit fraud or deception;" />
      <BulletItem text="3. impersonate another person or organization;" />
      <BulletItem text="4. harass, threaten, stalk, intimidate, or abuse another person;" />
      <BulletItem text="5. distribute malware, viruses, ransomware, spyware, or other malicious code;" />
      <BulletItem text="6. attempt unauthorized access to another user's account;" />
      <BulletItem text="7. circumvent authentication, access controls, or security mechanisms;" />
      <BulletItem text="8. probe, scan, or test the vulnerability of the App without authorization;" />
      <BulletItem text="9. interfere with the availability or operation of the App;" />
      <BulletItem text="10. scrape or systematically collect user information without authorization;" />
      <BulletItem text="11. reverse engineer or attempt to derive source code except where expressly permitted by law;" />
      <BulletItem text="12. upload content that infringes intellectual-property rights;" />
      <BulletItem text="13. upload unlawful, defamatory, fraudulent, threatening, obscene, or otherwise prohibited material;" />
      <BulletItem text="14. distribute sexually exploitative material;" />
      <BulletItem text="15. exploit or endanger children;" />
      <BulletItem text="16. use the App to solicit illegal activity;" />
      <BulletItem text="17. distribute another person's private or confidential information without authorization;" />
      <BulletItem text="18. manipulate event, membership, payment, attendance, or organizational records;" />
      <BulletItem text="19. submit fraudulent receipts, invoices, claims, or financial information;" />
      <BulletItem text="20. use the App for unauthorized commercial solicitation or spam;" />
      <BulletItem text="21. interfere with another person's use of the Service;" />
      <BulletItem text="22. bypass role-based access controls;" />
      <BulletItem text="23. use another person's account without authorization;" />
      <BulletItem text="24. attempt to obtain information that the App does not make available to your role;" />
      <BulletItem text="25. use automated systems to access the Service without authorization;" />
      <BulletItem text="26. upload content designed to exploit application vulnerabilities;" />
      <BulletItem text="27. use the App to facilitate unlawful discrimination, abuse, or harassment; or" />
      <BulletItem text="28. assist another person in doing any of the prohibited acts above." />

      <Text style={styles.sectionHeader}>8. MESSAGING AND COMMUNICATION FEATURES</Text>
      <Text style={styles.paragraph}>
        Rotaract Connect may provide direct messages, group chats, event chats, announcements, and other communication functionality. Messages submitted may be processed, stored, transmitted, moderated, or reviewed as described in the Privacy Policy.
      </Text>
      <Text style={styles.paragraph}>
        The App is <Text style={styles.bold}>not an end-to-end encrypted private communications service unless expressly stated otherwise by the Operator</Text>. Users should not transmit passwords, authentication codes, highly sensitive personal information, or financial credentials through ordinary messaging.
      </Text>

      <Text style={styles.sectionHeader}>9. USER-GENERATED CONTENT</Text>
      <Text style={styles.paragraph}>
        “User Content” means any text, message, photograph, video, document, file, profile information, comment, event-related submission, review, or other material made available through the App.
      </Text>
      <Text style={styles.paragraph}>
        You retain ownership of User Content to the extent you legally own it. You grant the Operator a non-exclusive, worldwide, royalty-free license to host, store, reproduce, transmit, display, format, process, back up, and moderate that content solely to provide, secure, and maintain the Service. This does not give the Operator unrestricted commercial ownership.
      </Text>

      <Text style={styles.sectionHeader}>10. CONTENT MODERATION</Text>
      <Text style={styles.paragraph}>
        The Operator reserves the right to review, restrict, remove, disable access to, or preserve User Content where reasonably necessary to enforce Terms, investigate abuse, comply with law, prevent fraud, or protect the Service and its users.
      </Text>

      <Text style={styles.sectionHeader}>11. REPORTING ABUSE</Text>
      <Text style={styles.paragraph}>
        Users may report suspected harassment, threats, impersonation, unauthorized access, inappropriate content, fraudulent activity, privacy violations, or child safety concerns through the in-app reporting mechanism or by contacting: <Text style={styles.bold}>support@rotaract3800.org</Text>.
      </Text>

      <Text style={styles.sectionHeader}>12. CHILD AND MINOR SAFETY</Text>
      <Text style={styles.paragraph}>
        Rotaract Connect is not intended to facilitate sexual exploitation, grooming, sexual solicitation, or exploitation of minors. Any use involving child abuse or exploitation is strictly prohibited. Philippine law (RA 11930) specifically criminalizes online sexual abuse and exploitation of children.
      </Text>

      <Text style={styles.sectionHeader}>13. PHOTOGRAPHS AND EVENT MEDIA</Text>
      <Text style={styles.paragraph}>
        You must not upload photographs or media that you do not have permission to upload. Where media contains identifiable persons, appropriate permission should be obtained.
      </Text>

      <Text style={styles.sectionHeader}>14. PAYMENTS, RECEIPTS, INVOICES, AND FINANCIAL RECORDS</Text>
      <Text style={styles.paragraph}>
        Users must provide truthful financial information. Submitting false receipts, manipulated records, or misleading data may result in account suspension, loss of privileges, and legal referral. Rotaract Connect is not itself a bank, financial institution, or escrow service.
      </Text>

      <Text style={styles.sectionHeader}>15. EVENTS</Text>
      <Text style={styles.paragraph}>
        Event organizers are responsible for information they submit. Users are responsible for reviewing event details and following reasonable safety instructions.
      </Text>

      <Text style={styles.sectionHeader}>16. LOCATION INFORMATION</Text>
      <Text style={styles.paragraph}>
        Location information may be used for venue identification and nearby event functionality. Permissions can be controlled via device settings.
      </Text>

      <Text style={styles.sectionHeader}>17. PUSH NOTIFICATIONS</Text>
      <Text style={styles.paragraph}>
        Notifications may be sent for messages, events, announcements, and account activity. Non-essential notifications may be managed via settings.
      </Text>

      <Text style={styles.sectionHeader}>18. THIRD-PARTY SERVICES</Text>
      <Text style={styles.paragraph}>
        The App relies on third-party infrastructure (e.g., Supabase, cloud hosting). Third-party services have their own terms and privacy policies.
      </Text>

      <Text style={styles.sectionHeader}>19. INTELLECTUAL PROPERTY</Text>
      <Text style={styles.paragraph}>
        The App software, interface, branding, logos, design, and graphics are owned by or licensed to the Operator. Unauthorized reproduction or reverse engineering is prohibited.
      </Text>

      <Text style={styles.sectionHeader}>20. USER FEEDBACK</Text>
      <Text style={styles.paragraph}>
        Feedback and suggestions submitted voluntarily may be used by the Operator without compensation or obligation.
      </Text>

      <Text style={styles.sectionHeader}>21. SECURITY</Text>
      <Text style={styles.paragraph}>
        Reasonable administrative, physical, and technical safeguards are implemented; however, no internet-connected system can be guaranteed 100% secure.
      </Text>

      <Text style={styles.sectionHeader}>22. SERVICE AVAILABILITY</Text>
      <Text style={styles.paragraph}>
        The Service is provided on an availability basis and may experience maintenance, updates, or outages outside reasonable control.
      </Text>

      <Text style={styles.sectionHeader}>23. NO PROFESSIONAL OR EMERGENCY SERVICE</Text>
      <Text style={styles.paragraph}>
        Rotaract Connect is not an emergency, medical, legal, or crisis-response service. Do not use the App as the sole means for emergency assistance.
      </Text>

      <Text style={styles.sectionHeader}>24. DISCLAIMERS</Text>
      <Text style={styles.paragraph}>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS. THE OPERATOR DISCLAIMS ALL WARRANTIES THAT CANNOT LAWFULLY BE DISCLAIMED.
      </Text>

      <Text style={styles.sectionHeader}>25. LIMITATION OF LIABILITY</Text>
      <Text style={styles.paragraph}>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE OPERATOR SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM USE OR INABILITY TO USE THE SERVICE.
      </Text>

      <Text style={styles.sectionHeader}>26. INDEMNIFICATION</Text>
      <Text style={styles.paragraph}>
        You agree to indemnify and hold harmless the Operator, its officers, directors, and agents from claims arising from material violation of these Terms, unlawful use, or infringement of another person's rights.
      </Text>

      <Text style={styles.sectionHeader}>27. SUSPENSION AND TERMINATION</Text>
      <Text style={styles.paragraph}>
        The Operator may suspend, restrict, or terminate access for violations of Terms, security risks, fraud, or when organizational authorization ends.
      </Text>

      <Text style={styles.sectionHeader}>28. EFFECT OF TERMINATION</Text>
      <Text style={styles.paragraph}>
        Upon termination, access rights cease. Necessary accounting, security, and dispute records may be retained as permitted by law.
      </Text>

      <Text style={styles.sectionHeader}>29. ACCOUNT DELETION</Text>
      <Text style={styles.paragraph}>
        Account deletion requests may be made through the App or by emailing <Text style={styles.bold}>privacy@rotaract3800.org</Text>.
      </Text>

      <Text style={styles.sectionHeader}>30. CHANGES TO THE SERVICE</Text>
      <Text style={styles.paragraph}>
        Features may be added, modified, redesigned, or discontinued at any time.
      </Text>

      <Text style={styles.sectionHeader}>31. CHANGES TO THESE TERMS</Text>
      <Text style={styles.paragraph}>
        Material changes will be communicated through the App or official channels. Continued use constitutes acceptance.
      </Text>

      <Text style={styles.sectionHeader}>32. PRIVACY</Text>
      <Text style={styles.paragraph}>
        Your use of the App is governed by the Rotaract Connect Privacy Policy, which forms part of this agreement.
      </Text>

      <Text style={styles.sectionHeader}>33. DATA PRIVACY RIGHTS</Text>
      <Text style={styles.paragraph}>
        Nothing in these Terms removes your rights under the Philippine Data Privacy Act of 2012 (RA 10173).
      </Text>

      <Text style={styles.sectionHeader}>34. GOVERNING LAW</Text>
      <Text style={styles.paragraph}>
        These Terms are governed by the laws of the <Text style={styles.bold}>Republic of the Philippines</Text>.
      </Text>

      <Text style={styles.sectionHeader}>35. DISPUTE RESOLUTION</Text>
      <Text style={styles.paragraph}>
        Parties should first attempt in good faith to resolve disputes by contacting <Text style={styles.bold}>support@rotaract3800.org</Text>.
      </Text>

      <Text style={styles.sectionHeader}>36. SEVERABILITY</Text>
      <Text style={styles.paragraph}>
        If any provision is found unlawful or unenforceable, remaining provisions remain in full effect.
      </Text>

      <Text style={styles.sectionHeader}>37. NO WAIVER</Text>
      <Text style={styles.paragraph}>
        Failure by the Operator to enforce any provision does not constitute a waiver of rights.
      </Text>

      <Text style={styles.sectionHeader}>38. ASSIGNMENT</Text>
      <Text style={styles.paragraph}>
        You may not transfer rights without prior written consent. The Operator may assign Terms in connection with organizational restructuring.
      </Text>

      <Text style={styles.sectionHeader}>39. ENTIRE AGREEMENT</Text>
      <Text style={styles.paragraph}>
        These Terms and the Privacy Policy constitute the entire agreement between you and the Operator.
      </Text>

      <Text style={styles.sectionHeader}>40. CONTACT</Text>
      <View style={styles.contactCard}>
        <Text style={styles.contactText}><Text style={styles.bold}>Operator:</Text> Rotaract District 3800</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Address:</Text> District 3800, Metro Manila & Rizal, Philippines</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Email:</Text> support@rotaract3800.org</Text>
      </View>

      <View style={styles.ackBox}>
        <Text style={styles.ackTitle}>ACKNOWLEDGMENT</Text>
        <Text style={styles.ackText}>
          By selecting “I Agree,” creating an account, or otherwise using Rotaract Connect, you acknowledge that you have read, understood, and agree to comply with these Terms.
        </Text>
        <Text style={[styles.ackText, { marginTop: 6, fontSize: 11, color: colors.textMuted }]}>
          Version: 1.0.0 • Effective: August 18, 2026
        </Text>
      </View>
    </View>
  );
}

function PrivacyContent() {
  return (
    <View style={styles.tabContent}>
      {/* Document Meta Banner */}
      <View style={styles.metaCard}>
        <Text style={styles.docTitle}>ROTARACT CONNECT</Text>
        <Text style={styles.docSubtitle}>PRIVACY POLICY</Text>
        <View style={styles.metaDivider} />
        <Text style={styles.metaLine}><Text style={styles.bold}>Effective Date:</Text> August 18, 2026</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Last Updated:</Text> August 18, 2026</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Personal Information Controller:</Text> Rotaract District 3800</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Data Protection Officer (DPO):</Text> District DPO Contact</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Privacy Email:</Text> privacy@rotaract3800.org</Text>
        <Text style={styles.metaLine}><Text style={styles.bold}>Address:</Text> District 3800, Metro Manila & Rizal, Philippines</Text>
      </View>

      <Text style={styles.sectionHeader}>1. PURPOSE OF THIS PRIVACY POLICY</Text>
      <Text style={styles.paragraph}>
        This Privacy Policy explains how <Text style={styles.bold}>Rotaract District 3800</Text> (“we,” “us,” “our,” or “Operator”) collects, uses, stores, discloses, protects, and processes personal information through <Text style={styles.bold}>Rotaract Connect</Text>.
      </Text>
      <Text style={styles.paragraph}>
        We recognize that privacy is important. This policy provides transparent information regarding our processing practices and your rights under applicable privacy laws, including the <Text style={styles.bold}>Philippine Data Privacy Act of 2012 (Republic Act No. 10173)</Text> and its implementing rules, ensuring transparency, legitimate purpose, and proportionality.
      </Text>

      <Text style={styles.sectionHeader}>2. WHO IS RESPONSIBLE FOR YOUR INFORMATION?</Text>
      <View style={styles.contactCard}>
        <Text style={styles.contactText}><Text style={styles.bold}>Personal Information Controller:</Text> Rotaract District 3800</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Address:</Text> District 3800, Metro Manila & Rizal, Philippines</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Privacy Email:</Text> privacy@rotaract3800.org</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Data Protection Officer:</Text> District DPO</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>DPO Email:</Text> dpo@rotaract3800.org</Text>
      </View>

      <Text style={styles.sectionHeader}>3. INFORMATION WE MAY COLLECT</Text>
      
      <Text style={styles.subSectionHeader}>3.1 Account Information</Text>
      <BulletItem text="• full name, email address, username, password-related authentication info;" />
      <BulletItem text="• profile photograph, telephone/mobile number;" />
      <BulletItem text="• account creation date, verification status, club affiliation, role or position, user ID, preferences." />

      <Text style={styles.subSectionHeader}>3.2 Organizational Information</Text>
      <BulletItem text="• club affiliation, district affiliation, membership status;" />
      <BulletItem text="• officer role, committee assignments, event participation, attendance, and organizational contact info." />

      <Text style={styles.subSectionHeader}>3.3 Messages and Communications</Text>
      <BulletItem text="• message content, sender and recipient information, group membership, attachments, timestamps, and delivery status." />

      <Text style={styles.subSectionHeader}>3.4 Event Information</Text>
      <BulletItem text="• event registrations, attendance records, RSVP status, event messages, venue info, check-ins." />

      <Text style={styles.subSectionHeader}>3.5 Uploaded Files and Documents</Text>
      <BulletItem text="• receipts, invoices, photographs, documents, event materials, membership proof/ID, and organizational records." />

      <Text style={styles.subSectionHeader}>3.6 Payment and Financial Information</Text>
      <BulletItem text="• payment amount, date, transaction reference, receipts, invoices, expense records." />
      <Text style={[styles.paragraph, styles.bold, { marginTop: 4 }]}>
        Unless expressly stated otherwise, the App does not collect or store full payment-card numbers, CVV/CVC codes, or banking passwords.
      </Text>

      <Text style={styles.sectionHeader}>4. LOCATION INFORMATION</Text>
      <Text style={styles.paragraph}>
        Location information may be used to display nearby venues and verify proximity for event check-ins within the designated radius. Device location permissions can be toggled in system settings.
      </Text>

      <Text style={styles.sectionHeader}>5. DEVICE AND TECHNICAL INFORMATION</Text>
      <Text style={styles.paragraph}>
        We collect device type, OS version, App version, IP address, session tokens, crash diagnostics, and security logs to protect service operations, troubleshoot errors, and prevent fraud.
      </Text>

      <Text style={styles.sectionHeader}>6. PUSH NOTIFICATION INFORMATION</Text>
      <Text style={styles.paragraph}>
        Push notification tokens are processed to deliver alerts regarding messages, events, announcements, and account security. Notification preferences can be managed in settings.
      </Text>

      <Text style={styles.sectionHeader}>7. INFORMATION WE RECEIVE FROM OTHER SOURCES</Text>
      <Text style={styles.paragraph}>
        We may receive information from authorized club administrators (e.g., membership records, rosters, officer designations, verification approvals).
      </Text>

      <Text style={styles.sectionHeader}>8. PURPOSES OF PROCESSING</Text>
      <BulletItem text="• Account & Authentication: Account creation, verification, session maintenance, and recovery." />
      <BulletItem text="• Organizational Administration: Membership rosters, role management, club coordination." />
      <BulletItem text="• Communications: Direct messages, group chats, announcements, and alerts." />
      <BulletItem text="• Events: Managing registrations, tracking attendance, and check-in radius verification." />
      <BulletItem text="• Financial Administration: Payment references, receipt verification, expense reviews." />
      <BulletItem text="• Security: Fraud prevention, unauthorized access detection, audit logging." />
      <BulletItem text="• Legal Compliance: Compliance with applicable Philippine laws, valid court orders, and regulations." />

      <Text style={styles.sectionHeader}>9. LEGAL BASES FOR PROCESSING</Text>
      <Text style={styles.paragraph}>
        Processing is grounded in consent, performance of service agreements, compliance with legal obligations, legitimate organizational functions, and vital interests under RA 10173.
      </Text>

      <Text style={styles.sectionHeader}>10. SENSITIVE PERSONAL INFORMATION</Text>
      <Text style={styles.paragraph}>
        We avoid collecting unnecessary sensitive information. Users should not upload government ID numbers, bank passwords, medical records, or biometric data unless explicitly requested for a lawful purpose.
      </Text>

      <Text style={styles.sectionHeader}>11. DATA SHARING AND DISCLOSURE</Text>
      <BulletItem text="• Authorized Organizational Administrators: For legitimate club and district operations." />
      <BulletItem text="• Service Processors: Cloud hosting, database (Supabase), secure storage, and notifications." />
      <BulletItem text="• Legal Authorities: When required by lawful court orders, subpoenas, or statutory obligations." />
      <Text style={[styles.paragraph, { marginTop: 4 }]}>
        <Text style={styles.bold}>We do not sell personal information</Text> to any commercial third parties.
      </Text>

      <Text style={styles.sectionHeader}>12. THIRD-PARTY PROCESSORS</Text>
      <Text style={styles.paragraph}>
        Rotaract Connect utilizes Supabase (database, authentication, and encrypted storage), push notification relays, and cloud infrastructure governed by contractual confidentiality safeguards.
      </Text>

      <Text style={styles.sectionHeader}>13. INTERNATIONAL DATA TRANSFERS</Text>
      <Text style={styles.paragraph}>
        Where cloud providers process data across regions, appropriate contractual, technical, and privacy safeguards are enforced in compliance with National Privacy Commission regulations.
      </Text>

      <Text style={styles.sectionHeader}>14. DATA RETENTION</Text>
      <View style={styles.tableCard}>
        <View style={styles.tableRowHeader}>
          <Text style={[styles.tableCol1, styles.bold]}>Information Category</Text>
          <Text style={[styles.tableCol2, styles.bold]}>General Retention Period</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableCol1}>Account Information</Text>
          <Text style={styles.tableCol2}>While account is active & reasonable period afterward</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableCol1}>Security & Auth Logs</Text>
          <Text style={styles.tableCol2}>For standard security audit periods</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableCol1}>Messages & Group Chats</Text>
          <Text style={styles.tableCol2}>Per organizational communication retention rules</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableCol1}>Event & Attendance</Text>
          <Text style={styles.tableCol2}>For organizational historical recordkeeping</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableCol1}>Financial & Receipts</Text>
          <Text style={styles.tableCol2}>For statutory accounting/legal retention periods</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableCol1}>Uploaded Documents</Text>
          <Text style={styles.tableCol2}>For duration of stated verification/purpose</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>15. ACCOUNT DELETION</Text>
      <Text style={styles.paragraph}>
        You may request account deletion anytime by emailing <Text style={styles.bold}>privacy@rotaract3800.org</Text> or via in-app profile settings. Identity verification may be required.
      </Text>

      <Text style={styles.sectionHeader}>16. YOUR DATA PRIVACY RIGHTS</Text>
      <Text style={styles.paragraph}>Under RA 10173, your rights include:</Text>
      <BulletItem text="• Right to be Informed: Know how and why your data is processed." />
      <BulletItem text="• Right to Access: Request copies of your personal information." />
      <BulletItem text="• Right to Correct: Rectify inaccurate or outdated details." />
      <BulletItem text="• Right to Object / Withdraw Consent: Object to processing or withdraw consent." />
      <BulletItem text="• Right to Erasure / Blocking: Request removal or blocking of data." />
      <BulletItem text="• Right to Data Portability: Obtain electronic data format." />
      <BulletItem text="• Right to Lodge a Complaint: File a complaint with the National Privacy Commission." />

      <Text style={styles.sectionHeader}>17. HOW TO EXERCISE YOUR RIGHTS</Text>
      <View style={styles.contactCard}>
        <Text style={styles.contactText}><Text style={styles.bold}>DPO Email:</Text> dpo@rotaract3800.org</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Subject:</Text> Rotaract Connect – Privacy Rights Request</Text>
        <Text style={[styles.contactText, { marginTop: 4, fontSize: 12 }]}>
          Please include your full name, registered email, club affiliation, and the specific request.
        </Text>
      </View>

      <Text style={styles.sectionHeader}>18. RESPONSE TO PRIVACY REQUESTS</Text>
      <Text style={styles.paragraph}>
        Privacy requests will be evaluated and fulfilled in accordance with Data Privacy Act guidelines and required response timetables.
      </Text>

      <Text style={styles.sectionHeader}>19. SECURITY MEASURES</Text>
      <Text style={styles.paragraph}>
        We enforce role-based access control, encrypted TLS data in transit, encrypted storage, audit trails, and strict confidentiality protocols across District 3800 systems.
      </Text>

      <Text style={styles.sectionHeader}>20. NO ABSOLUTE SECURITY GUARANTEE</Text>
      <Text style={styles.paragraph}>
        While robust safeguards exist, no internet platform is completely immune to cyber risks. In the event of a personal data breach, mandated NPC notifications and incident procedures will be executed.
      </Text>

      <Text style={styles.sectionHeader}>21. COOKIES AND SIMILAR TECHNOLOGIES</Text>
      <Text style={styles.paragraph}>
        The App uses local secure storage, authentication tokens, and device identifiers strictly necessary to operate the application.
      </Text>

      <Text style={styles.sectionHeader}>22. DIRECT MARKETING</Text>
      <Text style={styles.paragraph}>
        We do not use your personal information for commercial marketing without consent. Only official Rotaract district communications are transmitted.
      </Text>

      <Text style={styles.sectionHeader}>23. THIRD-PARTY LINKS</Text>
      <Text style={styles.paragraph}>
        External links (e.g. rotary.org) have independent privacy policies. Users are encouraged to review third-party policies.
      </Text>

      <Text style={styles.sectionHeader}>24. USER-GENERATED CONTENT AND PRIVACY</Text>
      <Text style={styles.paragraph}>
        Content posted in public or group areas (e.g., chatrooms, event feeds) is visible to group participants. Exercise discretion when sharing personal information.
      </Text>

      <Text style={styles.sectionHeader}>25. ORGANIZATIONAL ADMINISTRATORS</Text>
      <Text style={styles.paragraph}>
        Club Presidents and District Admins must access data solely for official club duties. Misuse or unauthorized dissemination results in immediate revocation and sanctions.
      </Text>

      <Text style={styles.sectionHeader}>26. DATA PROCESSORS AND OUTSOURCING</Text>
      <Text style={styles.paragraph}>
        All third-party service providers are bound by strict data processing agreements ensuring confidentiality and compliance with RA 10173.
      </Text>

      <Text style={styles.sectionHeader}>27. PRIVACY OF CHILDREN AND MINORS</Text>
      <Text style={styles.paragraph}>
        Rotaract Connect enforces zero-tolerance policies against minor exploitation in full compliance with Republic Act No. 11930.
      </Text>

      <Text style={styles.sectionHeader}>28. PRIVACY INCIDENTS</Text>
      <Text style={styles.paragraph}>
        Report suspected security incidents or compromised credentials immediately to <Text style={styles.bold}>privacy@rotaract3800.org</Text>.
      </Text>

      <Text style={styles.sectionHeader}>29. LEGAL DISCLOSURES</Text>
      <Text style={styles.paragraph}>
        Disclosures to judicial or statutory authorities are limited strictly to lawful subpoenas and legal mandates.
      </Text>

      <Text style={styles.sectionHeader}>30. CHANGES TO THIS PRIVACY POLICY</Text>
      <Text style={styles.paragraph}>
        Policy updates will be posted in-app with revised effective dates. Material changes will be highlighted for member awareness.
      </Text>

      <Text style={styles.sectionHeader}>31. CONTACTING THE DATA PROTECTION OFFICER</Text>
      <View style={styles.contactCard}>
        <Text style={styles.contactText}><Text style={styles.bold}>Data Protection Officer:</Text> District DPO</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Email:</Text> dpo@rotaract3800.org</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Address:</Text> District 3800, Metro Manila & Rizal, Philippines</Text>
        <Text style={styles.contactText}><Text style={styles.bold}>Support:</Text> support@rotaract3800.org</Text>
      </View>

      <Text style={styles.sectionHeader}>32. NATIONAL PRIVACY COMMISSION</Text>
      <Text style={styles.paragraph}>
        Complaints or inquiries regarding Philippine data privacy compliance may be filed with the <Text style={styles.bold}>National Privacy Commission (NPC)</Text> via privacy.gov.ph.
      </Text>

      <Text style={styles.sectionHeader}>33. IMPORTANT LIMITATION</Text>
      <Text style={styles.paragraph}>
        Mandatory statutory rights granted under Republic Act No. 10173 prevail over any conflicting terms.
      </Text>

      <View style={styles.ackBox}>
        <Text style={styles.ackTitle}>ACKNOWLEDGMENT</Text>
        <Text style={styles.ackText}>
          By using Rotaract Connect, you acknowledge that you have been provided access to this Privacy Policy and have had a reasonable opportunity to review it.
        </Text>
        <Text style={[styles.ackText, { marginTop: 6, fontSize: 11, color: colors.textMuted }]}>
          Version: 1.0.0 • Effective Date: August 18, 2026
        </Text>
      </View>
    </View>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  safeContainer: {
    width: '100%',
    maxWidth: 580,
    height: '88%',
  },
  modalCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  contentScroll: {
    flex: 1,
  },
  scrollBody: {
    padding: 20,
    paddingBottom: 20,
  },
  tabContent: {
    gap: 10,
  },
  metaCard: {
    backgroundColor: '#FDF2F7',
    borderWidth: 1,
    borderColor: '#F9D6E5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  docSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  metaDivider: {
    height: 1,
    backgroundColor: '#F9D6E5',
    marginVertical: 8,
  },
  metaLine: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
  },
  sectionHeader: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.text,
    marginTop: 12,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  subSectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 6,
  },
  paragraph: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 19,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  bulletRow: {
    paddingLeft: 4,
    marginVertical: 1,
  },
  bulletText: {
    fontSize: 12.5,
    color: '#374151',
    lineHeight: 18,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginVertical: 4,
  },
  alertBoxText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
    fontWeight: '700',
    lineHeight: 17,
  },
  contactCard: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 4,
    gap: 3,
  },
  contactText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  ackBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 4,
  },
  ackTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ackText: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
  },
  tableCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginVertical: 6,
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  tableCol1: {
    flex: 1.2,
    fontSize: 11.5,
    color: colors.text,
  },
  tableCol2: {
    flex: 1.8,
    fontSize: 11.5,
    color: '#4B5563',
  },
  footer: {
    padding: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#fff',
  },
  acceptRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  fullCloseBtn: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  fullCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
});
