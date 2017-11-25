'use strict';

module.exports = function (grunt) {

  grunt.initConfig({
    concat: {
      dist: {
        src: [
          'app/*.js',
          'generated/*.js'
        ],
        dest: 'dist/fng-audit.js'
      }
    },
    ngtemplates: {
      fngAuditModule: {
        src: 'templates/**.html',
        dest: 'generated/templates.js',
        options: {
          htmlmin: {
            collapseBooleanAttributes: true,
            collapseWhitespace: true,
            removeAttributeQuotes: true,
            removeComments: true,
            removeEmptyAttributes: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true
          }
        }
      }
    },
    uglify: {
      dist: {
        files: {
          'dist/fng-audit.min.js': ['dist/fng-audit.js']
        }
      }
    }

  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-angular-templates');

  grunt.registerTask('build', ['ngtemplates', 'concat', 'uglify']);
  grunt.registerTask('default', ['build']);

};