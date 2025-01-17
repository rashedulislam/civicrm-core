// https://civicrm.org/licensing
(function(angular, $, _) {
  "use strict";

  angular.module('afGuiEditor').component('afGuiSearch', {
    templateUrl: '~/afGuiEditor/afGuiSearch.html',
    bindings: {
      display: '<'
    },
    require: {editor: '^^afGuiEditor'},
    controller: function ($scope, $timeout, afGui) {
      var ts = $scope.ts = CRM.ts('org.civicrm.afform_admin');
      var ctrl = this;
      $scope.controls = {};
      $scope.fieldList = [];
      $scope.calcFieldList = [];
      $scope.blockList = [];
      $scope.blockTitles = [];
      $scope.elementList = [];
      $scope.elementTitles = [];

      $scope.getField = afGui.getField;

      // Live results for the select2 of filter fields
      this.getFilterFields = function() {
        var fieldGroups = [],
          entities = getEntities();
        if (ctrl.display.calc_fields && ctrl.display.calc_fields.length) {
          fieldGroups.push({
            text: ts('Calculated Fields'),
            children: _.transform(ctrl.display.calc_fields, function(fields, el) {
              fields.push({id: el.name, text: el.defn.label, disabled: ctrl.fieldInUse(el.name)});
            }, [])
          });
        }
        _.each(entities, function(entity) {
          fieldGroups.push({
            text: entity.label,
            children: _.transform(entity.fields, function(fields, field) {
              fields.push({id: entity.prefix + field.name, text: entity.label + ' ' + field.label, disabled: ctrl.fieldInUse(entity.prefix + field.name)});
            }, [])
          });
        });
        return {results: fieldGroups};
      };

      this.buildPaletteLists = function() {
        var search = $scope.controls.fieldSearch ? $scope.controls.fieldSearch.toLowerCase() : null;
        buildCalcFieldList(search);
        buildFieldList(search);
        buildBlockList(search);
        buildElementList(search);
      };

      // Gets the name of the entity a field belongs to
      this.getFieldEntity = function(fieldName) {
        if (fieldName.indexOf('.') < 0) {
          return ctrl.display['saved_search_id.api_entity'];
        }
        var alias = fieldName.split('.')[0],
          entity;
        _.each(ctrl.display['saved_search_id.api_params'].join, function(join) {
          var joinInfo = join[0].split(' AS ');
          if (alias === joinInfo[1]) {
            entity = joinInfo[0];
            return false;
          }
        });
        return entity || ctrl.display['saved_search_id.api_entity'];
      };

      function buildCalcFieldList(search) {
        $scope.calcFieldList.length = 0;
        _.each(_.cloneDeep(ctrl.display.calc_fields), function(field) {
          if (!search || _.contains(field.defn.label.toLowerCase(), search)) {
            $scope.calcFieldList.push(field);
          }
        });
      }

      function buildBlockList(search) {
        $scope.blockList.length = 0;
        $scope.blockTitles.length = 0;
        _.each(afGui.meta.blocks, function(block, directive) {
          if (!search || _.contains(directive, search) || _.contains(block.name.toLowerCase(), search) || _.contains(block.title.toLowerCase(), search)) {
            var item = {"#tag": directive};
            $scope.blockList.push(item);
            $scope.blockTitles.push(block.title);
          }
        });
      }

      // Fetch all entities used in search (main entity + joins)
      function getEntities() {
        var
          mainEntity = afGui.getEntity(ctrl.display['saved_search_id.api_entity']),
          entityCount = {},
          entities = [{
            name: mainEntity.entity,
            prefix: '',
            label: mainEntity.label,
            fields: mainEntity.fields
          }];
        entityCount[mainEntity.entity] = 1;

        _.each(ctrl.display['saved_search_id.api_params'].join, function(join) {
          var joinInfo = join[0].split(' AS '),
            entity = afGui.getEntity(joinInfo[0]);
          entityCount[entity.entity] = (entityCount[entity.entity] || 0) + 1;
          entities.push({
            name: entity.entity,
            prefix: joinInfo[1] + '.',
            label: entity.label + (entityCount[entity.entity] > 1 ? ' ' + entityCount[entity.entity] : ''),
            fields: entity.fields,
          });
        });

        return entities;
      }

      function buildFieldList(search) {
        $scope.fieldList.length = 0;
        var entities = getEntities();
        _.each(entities, function(entity) {
          $scope.fieldList.push({
            entityType: entity.name,
            label: ts('%1 Fields', {1: entity.label}),
            fields: filterFields(entity.fields, entity.prefix)
          });
        });

        function filterFields(fields, prefix) {
          return _.transform(fields, function(fieldList, field) {
            if (!search || _.contains(field.name, search) || _.contains(field.label.toLowerCase(), search)) {
              fieldList.push(fieldDefaults(field, prefix));
            }
          }, []);
        }

        function fieldDefaults(field, prefix) {
          var tag = {
            "#tag": "af-field",
            name: prefix + field.name
          };
          if (field.input_type === 'Select' || field.input_type === 'ChainSelect') {
            tag.defn = {input_attrs: {multiple: true}};
          } else if (field.input_type === 'Date') {
            tag.defn = {input_type: 'Select', search_range: true};
          } else if (field.options) {
            tag.defn = {input_type: 'Select', input_attrs: {multiple: true}};
          }
          return tag;
        }
      }

      function buildElementList(search) {
        $scope.elementList.length = 0;
        $scope.elementTitles.length = 0;
        _.each(afGui.meta.elements, function(element, name) {
          if (!search || _.contains(name, search) || _.contains(element.title.toLowerCase(), search)) {
            var node = _.cloneDeep(element.element);
            if (name === 'fieldset') {
              return;
            }
            $scope.elementList.push(node);
            $scope.elementTitles.push(element.title);
          }
        });
      }

      // This gets called from jquery-ui so we have to manually apply changes to scope
      $scope.buildPaletteLists = function() {
        $timeout(function() {
          $scope.$apply(function() {
            ctrl.buildPaletteLists();
          });
        });
      };

      // Checks if a field is on the form or set as a filter
      this.fieldInUse = function(fieldName) {
        if (_.findIndex(ctrl.filters, {name: fieldName}) >= 0) {
          return true;
        }
        return !!getElement(ctrl.editor.layout['#children'], {'#tag': 'af-field', name: fieldName});
      };

      // Checks if fields in a block are already in use on the form.
      // Note that if a block contains no fields it can be used repeatedly, so this will always return false for those.
      $scope.blockInUse = function(block) {
        if (block['af-join']) {
          return !!getElement(ctrl.editor.layout['#children'], {'af-join': block['af-join']});
        }
        var fieldsInBlock = _.pluck(afGui.findRecursive(afGui.meta.blocks[block['#tag']].layout, {'#tag': 'af-field'}), 'name');
        return !!getElement(ctrl.editor.layout['#children'], function(item) {
          return item['#tag'] === 'af-field' && _.includes(fieldsInBlock, item.name);
        });
      };

      function getSearchDisplayElement() {
        return getElement(ctrl.editor.layout['#children'], {'#tag': ctrl.display['type:name'], 'display-name': ctrl.display.name, 'search-name': ctrl.display['saved_search_id.name']});
      }

      // Return an item matching criteria
      // Recursively checks the form layout, including block directives
      function getElement(group, criteria, found) {
        if (!found) {
          found = {};
        }
        var match = _.find(group, criteria);
        if (match) {
          found.match = match;
          return match;
        }
        _.each(group, function(item) {
          if (found.match) {
            return false;
          }
          if (_.isPlainObject(item)) {
            // Recurse through everything
            if (item['#children']) {
              getElement(item['#children'], criteria, found);
            }
            // Recurse into block directives
            else if (item['#tag'] && item['#tag'] in afGui.meta.blocks) {
              getElement(afGui.meta.blocks[item['#tag']].layout, criteria, found);
            }
          }
        });
        return found.match;
      }

      function filtersToArray() {
        return _.transform(ctrl.display.filters, function(result, value, key) {
          var info = {
            name: key,
            mode: value.indexOf('routeParams') === 0 ? 'url' : 'val'
          };
          // Object dot notation
          if (info.mode === 'url' && value.indexOf('routeParams.') === 0) {
            info.value = value.replace('routeParams.', '');
          }
          // Object bracket notation
          else if (info.mode === 'url') {
            info.value = decode(value.substring(value.indexOf('[') + 1, value.lastIndexOf(']')));
          }
          // Literal value
          else {
            info.value = decode(value);
          }
          result.push(info);
        }, []);
      }

      // Convert javascript notation to value
      function decode(encoded) {
        // Single-quoted string
        if (encoded.indexOf("'") === 0 && encoded.charAt(encoded.length - 1) === "'") {
          return encoded.substring(1, encoded.length - 1);
        }
        // Anything else
        return JSON.parse(encoded);
      }

      // Convert value to javascript notation
      function encode(value) {
        var encoded = JSON.stringify(value),
          split = encoded.split('"');
        // Convert double-quotes to single-quotes if possible
        if (split.length === 3 && split[0] === '' && split[2] === '' && encoded.indexOf("'") < 0) {
          return "'" + split[1] + "'";
        }
        return encoded;
      }

      // Append a search filter
      this.addFilter = function(fieldName) {
        ctrl.filters.push({
          name: fieldName,
          value: fieldName,
          mode: 'url'
        });
      };

      // Respond to changing a filter field name
      this.onChangeFilter = function(index) {
        var filter = ctrl.filters[index];
        if (filter.name) {
          filter.mode = 'url';
          filter.value = filter.name;
        } else {
          ctrl.filters.splice(index, 1);
        }
      };

      // Convert filters array to js notation & add to crm-search-display element
      function writeFilters() {
        var element = getSearchDisplayElement(),
          output = [];
        if (!ctrl.filters.length) {
          delete element.filters;
          return;
        }
        _.each(ctrl.filters, function(filter) {
          var keyVal = [
            // Enclose the key in quotes unless it is purely alphanumeric
            filter.name.match(/\W/) ? encode(filter.name) : filter.name,
          ];
          // Object dot notation
          if (filter.mode === 'url' && !filter.value.match(/\W/)) {
            keyVal.push('routeParams.' + filter.value);
          }
          // Object bracket notation
          else if (filter.mode === 'url') {
            keyVal.push('routeParams[' + encode(filter.value) + ']');
          }
          // Literal value
          else {
            keyVal.push(encode(filter.value));
          }
          output.push(keyVal.join(': '));
        });
        element.filters = '{' + output.join(', ') + '}';
      }

      this.$onInit = function() {
        this.meta = afGui.meta;
        this.filters = filtersToArray();
        $scope.$watch('$ctrl.filters', writeFilters, true);
        // When a new block is saved, update the list
        $scope.$watchCollection('$ctrl.meta.blocks', function() {
          $scope.controls.fieldSearch = '';
          ctrl.buildPaletteLists();
        });
      };
    }
  });

})(angular, CRM.$, CRM._);
