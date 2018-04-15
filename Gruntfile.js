'use strict';

module.exports = function (grunt) {

  grunt.initConfig({
    concat: {
      dist: {
        src: [
          'src/client/*.js',
          'src/client/templates/generated/*.js'
        ],
        dest: 'dist/client/fng-audit.js'
      }
    },
    ngtemplates: {
      fngAuditModule: {
        src: 'src/client/templates/**.html',
        dest: 'src/client/templates/generated/templates.js',
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
          'dist/client/fng-audit.min.js': ['dist/client/fng-audit.js']
        }
      }
    },
    copy: {
      dist: {
        files: [{
          expand: true,
          cwd: 'src/server/',
          src: ['**/*.js'],
          dest: 'dist/server/'
        },
          {
            expand: true,
            cwd: 'src/client/',
            src: 'fng-audit.js.map',
            dest: 'dist/client/'
          }]
      }
    }

  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-angular-templates');
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.registerTask('build', ['ngtemplates', 'concat', 'uglify', 'copy']);
  grunt.registerTask('default', ['build']);

};