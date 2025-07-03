/**
 * Yogify Database Issue Fixer
 * Identifies and fixes common database issues
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class DatabaseFixer {
  constructor() {
    this.issues = [];
    this.fixes = [];
  }

  async fixParticipantCounts() {
    console.log('🔧 Fixing participant counts...');
    
    try {
      // Get all classes
      const { data: classes, error: classesError } = await supabase
        .from('yoga_classes')
        .select('id, current_participants')
        .order('date', { ascending: false })
        .limit(100);
        
      if (classesError) throw classesError;
      
      let fixedCount = 0;
      
      for (const cls of classes) {
        // Count confirmed bookings
        const { count, error: countError } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .eq('status', 'confirmed');
          
        if (countError) {
          console.log(`Warning: Could not count bookings for class ${cls.id}: ${countError.message}`);
          continue;
        }
        
        if (count !== cls.current_participants) {
          // Fix the inconsistency
          const { error: updateError } = await supabase
            .from('yoga_classes')
            .update({ current_participants: count })
            .eq('id', cls.id);
            
          if (updateError) {
            console.log(`Warning: Could not fix participant count for class ${cls.id}: ${updateError.message}`);
            this.issues.push({
              type: 'participant_count',
              class_id: cls.id,
              error: updateError.message
            });
          } else {
            fixedCount++;
            this.fixes.push({
              type: 'participant_count',
              class_id: cls.id,
              old_count: cls.current_participants,
              new_count: count
            });
            
            // Add audit record
            try {
              await supabase
                .from('participant_count_audit')
                .insert([{
                  class_id: cls.id,
                  action: 'sync',
                  old_count: cls.current_participants,
                  new_count: count,
                  reason: 'Automated fix'
                }]);
            } catch (auditError) {
              console.log(`Warning: Could not create audit record: ${auditError.message}`);
            }
          }
        }
      }
      
      console.log(`✅ Fixed ${fixedCount} participant count inconsistencies`);
      return fixedCount;
    } catch (error) {
      console.error(`❌ Error fixing participant counts: ${error.message}`);
      this.issues.push({
        type: 'participant_count_fix',
        error: error.message
      });
      return 0;
    }
  }

  async fixOrphanedRecords() {
    console.log('🔧 Fixing orphaned records...');
    
    try {
      // Check for orphaned teacher_profiles
      const { data: orphanedProfiles, error: profilesError } = await supabase
        .from('teacher_profiles')
        .select(`
          id,
          profiles!left (id)
        `)
        .is('profiles.id', null);
        
      if (profilesError) throw profilesError;
      
      if (orphanedProfiles && orphanedProfiles.length > 0) {
        console.log(`Found ${orphanedProfiles.length} orphaned teacher profiles`);
        
        for (const profile of orphanedProfiles) {
          const { error: deleteError } = await supabase
            .from('teacher_profiles')
            .delete()
            .eq('id', profile.id);
            
          if (deleteError) {
            console.log(`Warning: Could not delete orphaned teacher profile ${profile.id}: ${deleteError.message}`);
            this.issues.push({
              type: 'orphaned_profile',
              profile_id: profile.id,
              error: deleteError.message
            });
          } else {
            this.fixes.push({
              type: 'orphaned_profile',
              profile_id: profile.id,
              action: 'deleted'
            });
          }
        }
      } else {
        console.log('✅ No orphaned teacher profiles found');
      }
      
      // Check for orphaned teacher_ratings
      const { data: orphanedRatings, error: ratingsError } = await supabase
        .from('teacher_ratings')
        .select(`
          teacher_id,
          profiles!left (id)
        `)
        .is('profiles.id', null);
        
      if (ratingsError) throw ratingsError;
      
      if (orphanedRatings && orphanedRatings.length > 0) {
        console.log(`Found ${orphanedRatings.length} orphaned teacher ratings`);
        
        for (const rating of orphanedRatings) {
          const { error: deleteError } = await supabase
            .from('teacher_ratings')
            .delete()
            .eq('teacher_id', rating.teacher_id);
            
          if (deleteError) {
            console.log(`Warning: Could not delete orphaned teacher rating ${rating.teacher_id}: ${deleteError.message}`);
            this.issues.push({
              type: 'orphaned_rating',
              teacher_id: rating.teacher_id,
              error: deleteError.message
            });
          } else {
            this.fixes.push({
              type: 'orphaned_rating',
              teacher_id: rating.teacher_id,
              action: 'deleted'
            });
          }
        }
      } else {
        console.log('✅ No orphaned teacher ratings found');
      }
      
      return this.fixes.filter(f => f.type === 'orphaned_profile' || f.type === 'orphaned_rating').length;
    } catch (error) {
      console.error(`❌ Error fixing orphaned records: ${error.message}`);
      this.issues.push({
        type: 'orphaned_records_fix',
        error: error.message
      });
      return 0;
    }
  }

  async fixMissingTeacherProfiles() {
    console.log('🔧 Fixing missing teacher profiles...');
    
    try {
      // Find teachers without teacher_profiles
      const { data: teachersWithoutProfiles, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          teacher_profiles!left (id)
        `)
        .eq('role', 'teacher')
        .is('teacher_profiles.id', null);
        
      if (error) throw error;
      
      if (teachersWithoutProfiles && teachersWithoutProfiles.length > 0) {
        console.log(`Found ${teachersWithoutProfiles.length} teachers without profiles`);
        
        for (const teacher of teachersWithoutProfiles) {
          // Create teacher profile
          const { error: insertError } = await supabase
            .from('teacher_profiles')
            .insert([{
              id: teacher.id,
              bio: `${teacher.full_name} is a yoga instructor passionate about helping students find balance and strength.`,
              experience_years: Math.floor(Math.random() * 10) + 1,
              specialties: ['Hatha', 'Vinyasa'],
              certifications: ['200-Hour Yoga Alliance'],
              social_links: {}
            }]);
            
          if (insertError) {
            console.log(`Warning: Could not create teacher profile for ${teacher.id}: ${insertError.message}`);
            this.issues.push({
              type: 'missing_teacher_profile',
              teacher_id: teacher.id,
              error: insertError.message
            });
          } else {
            this.fixes.push({
              type: 'missing_teacher_profile',
              teacher_id: teacher.id,
              action: 'created'
            });
            
            // Create teacher rating
            const { error: ratingError } = await supabase
              .from('teacher_ratings')
              .insert([{
                teacher_id: teacher.id,
                avg_rating: 5.0,
                total_reviews: 0,
                rating_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
              }]);
              
            if (ratingError) {
              console.log(`Warning: Could not create teacher rating for ${teacher.id}: ${ratingError.message}`);
            }
          }
        }
      } else {
        console.log('✅ All teachers have teacher profiles');
      }
      
      return this.fixes.filter(f => f.type === 'missing_teacher_profile').length;
    } catch (error) {
      console.error(`❌ Error fixing missing teacher profiles: ${error.message}`);
      this.issues.push({
        type: 'missing_teacher_profile_fix',
        error: error.message
      });
      return 0;
    }
  }

  async fixMissingTeacherRatings() {
    console.log('🔧 Fixing missing teacher ratings...');
    
    try {
      // Find teachers without ratings
      const { data: teachersWithoutRatings, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          teacher_ratings!left (teacher_id)
        `)
        .eq('role', 'teacher')
        .is('teacher_ratings.teacher_id', null);
        
      if (error) throw error;
      
      if (teachersWithoutRatings && teachersWithoutRatings.length > 0) {
        console.log(`Found ${teachersWithoutRatings.length} teachers without ratings`);
        
        for (const teacher of teachersWithoutRatings) {
          // Create teacher rating
          const { error: insertError } = await supabase
            .from('teacher_ratings')
            .insert([{
              teacher_id: teacher.id,
              avg_rating: 5.0,
              total_reviews: 0,
              rating_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
            }]);
            
          if (insertError) {
            console.log(`Warning: Could not create teacher rating for ${teacher.id}: ${insertError.message}`);
            this.issues.push({
              type: 'missing_teacher_rating',
              teacher_id: teacher.id,
              error: insertError.message
            });
          } else {
            this.fixes.push({
              type: 'missing_teacher_rating',
              teacher_id: teacher.id,
              action: 'created'
            });
          }
        }
      } else {
        console.log('✅ All teachers have ratings');
      }
      
      return this.fixes.filter(f => f.type === 'missing_teacher_rating').length;
    } catch (error) {
      console.error(`❌ Error fixing missing teacher ratings: ${error.message}`);
      this.issues.push({
        type: 'missing_teacher_rating_fix',
        error: error.message
      });
      return 0;
    }
  }

  async updateTeacherRatings() {
    console.log('🔧 Updating teacher ratings...');
    
    try {
      // Get all teachers
      const { data: teachers, error: teachersError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'teacher')
        .limit(50);
        
      if (teachersError) throw teachersError;
      
      let updatedCount = 0;
      
      for (const teacher of teachers) {
        // Get all reviews for this teacher
        const { data: reviews, error: reviewsError } = await supabase
          .from('teacher_reviews')
          .select('rating')
          .eq('teacher_id', teacher.id);
          
        if (reviewsError) {
          console.log(`Warning: Could not get reviews for teacher ${teacher.id}: ${reviewsError.message}`);
          continue;
        }
        
        if (reviews && reviews.length > 0) {
          // Calculate average rating
          const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
          const avgRating = totalRating / reviews.length;
          
          // Count ratings by value
          const ratingCounts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
          reviews.forEach(review => {
            ratingCounts[review.rating.toString()]++;
          });
          
          // Update teacher_ratings
          const { error: updateError } = await supabase
            .from('teacher_ratings')
            .upsert([{
              teacher_id: teacher.id,
              avg_rating: avgRating,
              total_reviews: reviews.length,
              rating_counts: ratingCounts
            }]);
            
          if (updateError) {
            console.log(`Warning: Could not update rating for teacher ${teacher.id}: ${updateError.message}`);
            this.issues.push({
              type: 'teacher_rating_update',
              teacher_id: teacher.id,
              error: updateError.message
            });
          } else {
            updatedCount++;
            this.fixes.push({
              type: 'teacher_rating_update',
              teacher_id: teacher.id,
              reviews_count: reviews.length,
              avg_rating: avgRating
            });
          }
        }
      }
      
      console.log(`✅ Updated ratings for ${updatedCount} teachers`);
      return updatedCount;
    } catch (error) {
      console.error(`❌ Error updating teacher ratings: ${error.message}`);
      this.issues.push({
        type: 'teacher_rating_update_fix',
        error: error.message
      });
      return 0;
    }
  }

  async createTestData() {
    console.log('🔧 Creating test data if needed...');
    
    try {
      // Check if we have enough test data
      const { count: profilesCount, error: profilesError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
        
      if (profilesError) throw profilesError;
      
      const { count: classesCount, error: classesError } = await supabase
        .from('yoga_classes')
        .select('*', { count: 'exact', head: true });
        
      if (classesError) throw classesError;
      
      const { count: bookingsCount, error: bookingsError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true });
        
      if (bookingsError) throw bookingsError;
      
      console.log(`Found ${profilesCount} profiles, ${classesCount} classes, and ${bookingsCount} bookings`);
      
      // If we have sufficient data, skip creating more
      if (profilesCount >= 6 && classesCount >= 6 && bookingsCount >= 6) {
        console.log('✅ Sufficient test data already exists');
        return 0;
      }
      
      // Create test users if needed
      const testUsers = {
        students: [
          { email: 's1@yogify.com', password: 'TestStudent1!', fullName: 'Student One' },
          { email: 's2@yogify.com', password: 'TestStudent2!', fullName: 'Student Two' },
          { email: 's3@yogify.com', password: 'TestStudent3!', fullName: 'Student Three' }
        ],
        teachers: [
          { email: 't1@yogify.com', password: 'TestTeacher1!', fullName: 'Teacher One' },
          { email: 't2@yogify.com', password: 'TestTeacher2!', fullName: 'Teacher Two' },
          { email: 't3@yogify.com', password: 'TestTeacher3!', fullName: 'Teacher Three' }
        ]
      };
      
      const createdUsers = {
        students: [],
        teachers: []
      };
      
      // Create students
      for (const student of testUsers.students) {
        try {
          // Check if user already exists
          const { data: existingUser, error: checkError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', student.email)
            .maybeSingle();
            
          if (existingUser) {
            console.log(`Student ${student.email} already exists`);
            createdUsers.students.push(existingUser);
            continue;
          }
          
          // Create auth user
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: student.email,
            password: student.password
          });
          
          if (authError) throw authError;
          
          if (authData.user) {
            // Create profile
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .insert([{
                id: authData.user.id,
                email: student.email,
                full_name: student.fullName,
                role: 'student'
              }])
              .select();
              
            if (profileError) throw profileError;
            
            createdUsers.students.push(profileData[0]);
            console.log(`Created student: ${student.email}`);
          }
        } catch (error) {
          console.log(`Warning: Could not create student ${student.email}: ${error.message}`);
        }
      }
      
      // Create teachers
      for (const teacher of testUsers.teachers) {
        try {
          // Check if user already exists
          const { data: existingUser, error: checkError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', teacher.email)
            .maybeSingle();
            
          if (existingUser) {
            console.log(`Teacher ${teacher.email} already exists`);
            createdUsers.teachers.push(existingUser);
            
            // Check if teacher profile exists
            const { data: teacherProfile, error: teacherProfileError } = await supabase
              .from('teacher_profiles')
              .select('id')
              .eq('id', existingUser.id)
              .maybeSingle();
              
            if (!teacherProfile) {
              // Create teacher profile
              await this.createTeacherProfile(existingUser.id, teacher.fullName);
            }
            
            continue;
          }
          
          // Create auth user
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: teacher.email,
            password: teacher.password
          });
          
          if (authError) throw authError;
          
          if (authData.user) {
            // Create profile
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .insert([{
                id: authData.user.id,
                email: teacher.email,
                full_name: teacher.fullName,
                role: 'teacher'
              }])
              .select();
              
            if (profileError) throw profileError;
            
            createdUsers.teachers.push(profileData[0]);
            console.log(`Created teacher: ${teacher.email}`);
            
            // Create teacher profile
            await this.createTeacherProfile(profileData[0].id, teacher.fullName);
          }
        } catch (error) {
          console.log(`Warning: Could not create teacher ${teacher.email}: ${error.message}`);
        }
      }
      
      // Create classes if needed
      if (classesCount < 6 && createdUsers.teachers.length > 0) {
        for (const teacher of createdUsers.teachers) {
          // Create past class
          try {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 7);
            
            const { data, error } = await supabase
              .from('yoga_classes')
              .insert([{
                title: `${teacher.full_name}'s Past Flow`,
                description: 'A gentle yoga class focusing on alignment and breath.',
                teacher_id: teacher.id,
                date: pastDate.toISOString().split('T')[0],
                time: '09:00:00',
                duration: 60,
                max_participants: 10,
                current_participants: 0,
                price: 25.00,
                level: 'beginner',
                type: 'Hatha',
                location: 'Studio A',
                is_retreat: false,
                is_virtual: false,
                image_url: 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800'
              }])
              .select();
              
            if (error) throw error;
            
            console.log(`Created past class for ${teacher.full_name}`);
          } catch (error) {
            console.log(`Warning: Could not create past class for ${teacher.full_name}: ${error.message}`);
          }
          
          // Create upcoming class
          try {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 7);
            
            const { data, error } = await supabase
              .from('yoga_classes')
              .insert([{
                title: `${teacher.full_name}'s Upcoming Flow`,
                description: 'Join this energizing yoga session to build strength and flexibility.',
                teacher_id: teacher.id,
                date: futureDate.toISOString().split('T')[0],
                time: '18:00:00',
                duration: 75,
                max_participants: 15,
                current_participants: 0,
                price: 30.00,
                level: 'intermediate',
                type: 'Vinyasa',
                location: 'Studio B',
                is_retreat: false,
                is_virtual: false,
                image_url: 'https://images.pexels.com/photos/3094230/pexels-photo-3094230.jpeg?auto=compress&cs=tinysrgb&w=800'
              }])
              .select();
              
            if (error) throw error;
            
            console.log(`Created upcoming class for ${teacher.full_name}`);
          } catch (error) {
            console.log(`Warning: Could not create upcoming class for ${teacher.full_name}: ${error.message}`);
          }
        }
      }
      
      console.log('✅ Test data creation completed');
      return createdUsers.students.length + createdUsers.teachers.length;
    } catch (error) {
      console.error(`❌ Error creating test data: ${error.message}`);
      this.issues.push({
        type: 'test_data_creation',
        error: error.message
      });
      return 0;
    }
  }
  
  // Helper: Create teacher profile
  async createTeacherProfile(teacherId, teacherName) {
    try {
      const specialties = ['Hatha', 'Vinyasa', 'Meditation'];
      const certifications = ['200-Hour Yoga Alliance', 'Meditation Certification'];
      
      const { data, error } = await supabase
        .from('teacher_profiles')
        .insert([{
          id: teacherId,
          bio: `${teacherName} is an experienced yoga teacher specializing in mindful practice and alignment.`,
          experience_years: Math.floor(Math.random() * 10) + 2,
          specialties,
          certifications,
          social_links: {
            instagram: 'yogateacher',
            website: 'yogateacher.com'
          },
          phone: '+1234567890'
        }])
        .select();
        
      if (error) throw error;
      
      console.log(`Created teacher profile for ${teacherId}`);
      
      // Initialize teacher rating
      const { data: ratingData, error: ratingError } = await supabase
        .from('teacher_ratings')
        .insert([{
          teacher_id: teacherId,
          avg_rating: 5.0,
          total_reviews: 0,
          rating_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
        }])
        .select();
        
      if (ratingError) {
        console.log(`Warning: Could not initialize teacher rating: ${ratingError.message}`);
      } else {
        console.log(`Created teacher rating for ${teacherId}`);
      }
      
      return data[0];
    } catch (error) {
      console.log(`Warning: Could not create teacher profile for ${teacherId}: ${error.message}`);
      this.issues.push({
        type: 'teacher_profile_creation',
        teacher_id: teacherId,
        error: error.message
      });
      return null;
    }
  }

  // Generate report
  generateReport() {
    console.log('\n📊 DATABASE FIX REPORT\n');
    console.log('='.repeat(50));
    
    console.log(`Issues Found: ${this.issues.length}`);
    console.log(`Fixes Applied: ${this.fixes.length}`);
    
    if (this.issues.length > 0) {
      console.log('\n🚨 ISSUES FOUND:\n');
      
      // Group issues by type
      const issuesByType = this.issues.reduce((acc, issue) => {
        if (!acc[issue.type]) {
          acc[issue.type] = [];
        }
        acc[issue.type].push(issue);
        return acc;
      }, {});
      
      for (const [type, issues] of Object.entries(issuesByType)) {
        console.log(`${type} Issues (${issues.length}):`);
        issues.slice(0, 5).forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue.error}`);
        });
        if (issues.length > 5) {
          console.log(`  ... and ${issues.length - 5} more`);
        }
        console.log('');
      }
    }
    
    if (this.fixes.length > 0) {
      console.log('\n✅ FIXES APPLIED:\n');
      
      // Group fixes by type
      const fixesByType = this.fixes.reduce((acc, fix) => {
        if (!acc[fix.type]) {
          acc[fix.type] = [];
        }
        acc[fix.type].push(fix);
        return acc;
      }, {});
      
      for (const [type, fixes] of Object.entries(fixesByType)) {
        console.log(`${type} Fixes (${fixes.length}):`);
        fixes.slice(0, 5).forEach((fix, index) => {
          let details = '';
          if (fix.action) details += `Action: ${fix.action}`;
          if (fix.old_count !== undefined) details += ` Count: ${fix.old_count} → ${fix.new_count}`;
          console.log(`  ${index + 1}. ${details}`);
        });
        if (fixes.length > 5) {
          console.log(`  ... and ${fixes.length - 5} more`);
        }
        console.log('');
      }
    }
    
    if (this.issues.length === 0 && this.fixes.length === 0) {
      console.log('\n✅ Database is healthy - no issues found!');
    }
    
    // Save report to file
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        issuesFound: this.issues.length,
        fixesApplied: this.fixes.length
      },
      issues: this.issues,
      fixes: this.fixes
    };
    
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportFile = path.join(reportsDir, `database-fix-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportFile}`);
    
    return report;
  }

  // Run all fixes
  async runAllFixes() {
    console.log('🚀 Starting Database Issue Resolution...\n');
    
    try {
      await this.createTestData();
      await this.fixParticipantCounts();
      await this.fixOrphanedRecords();
      await this.fixMissingTeacherProfiles();
      await this.fixMissingTeacherRatings();
      await this.updateTeacherRatings();
      
      return this.generateReport();
    } catch (error) {
      console.error('❌ Critical error during database fixes:', error);
      this.issues.push({
        type: 'critical_error',
        error: error.message
      });
      return this.generateReport();
    }
  }
}

// Run the fixer if this script is executed directly
if (require.main === module) {
  const fixer = new DatabaseFixer();
  fixer.runAllFixes()
    .then(report => {
      process.exit(report.issues.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = DatabaseFixer;