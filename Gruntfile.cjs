'use strict';

module.exports = function (grunt) {

  grunt.initConfig({
    concat: {
      dist: {
        src: ['src/client/*.js', '<%= ngtemplates.fngAuditModule.dest %>'],
        dest: '.tmp/client/fng-audit.js'
      }
    },
    ngtemplates: {
      fngAuditModule: {
        cwd: 'src/client/',
        src: 'templates/**.html',
        dest: '.tmp/templates.js',
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
    replace: {
      dist: {
        src: ['.tmp/client/fng-audit.js'],
        dest: '.tmp/client/fng-audit.js',
        replacements: [{
          from: /^\s*import\s+.*$/gm,
          to: ''
        }]
      }
    },
    umd: {
      all: {
        options: {
          src: '.tmp/client/fng-audit.js',
          dest: 'dist/client/fng-audit.js',
          objectToExport: 'null',
          indent: '  ',
          deps: {
            'default': ['angular', 'jsondiffpatch'],
            amd: ['angular', 'jsondiffpatch'],
            cjs: ['angular', 'jsondiffpatch'],
            global: ['angular', 'jsondiffpatch']
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
  grunt.loadNpmTasks('grunt-text-replace');
  grunt.loadNpmTasks('grunt-umd');

  grunt.registerTask('build', ['ngtemplates', 'concat', 'replace', 'umd', 'uglify', 'copy']);
  grunt.registerTask('default', ['build']);

};
