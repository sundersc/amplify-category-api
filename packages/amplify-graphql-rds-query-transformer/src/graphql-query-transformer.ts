import {
  DirectiveWrapper,
  InvalidDirectiveError,
  MappingTemplate,
  TransformerPluginBase,
} from '@aws-amplify/graphql-transformer-core';
import {
  DataSourceProvider,
  TransformerContextProvider,
  TransformerResolverProvider,
  TransformerSchemaVisitStepContextProvider
} from '@aws-amplify/graphql-transformer-interfaces';
import { LambdaDataSource } from '@aws-cdk/aws-appsync';
import {
  ITable,
} from '@aws-cdk/aws-dynamodb';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cdk from '@aws-cdk/core';
import {
  DirectiveNode,
  FieldDefinitionNode,
  InterfaceTypeDefinitionNode,
  Kind,
  ObjectTypeDefinitionNode,
} from 'graphql';
import {
  ResolverResourceIDs,
} from 'graphql-transformer-common';
import { QueryDirectiveConfiguration } from './directive';
import {
  generateDefaultResponseMappingTemplate,
  generateResolverKey,
} from './resolvers';
import {
  generateQueryRequestTemplate,
} from './resolvers/query';

/**
 * Nullable
 */
export type Nullable<T> = T | null;

export const directiveDefinition = /* GraphQl */ `
  directive @query(
    statement: String
  ) on FIELD_DEFINITION
`;

type QueryField = {
  typeName: string;
  fieldName: string;
}

/**
 * ModelTransformer
 */
export class QueryTransformer extends TransformerPluginBase {
  private datasourceMap: Record<string, DataSourceProvider> = {};
  private ddbTableMap: Record<string, ITable> = {};
  private resolverMap: Record<string, TransformerResolverProvider> = {};
  private typesWithQueryDirective: Set<QueryField> = new Set();
  private queryMap: Map<QueryField, string> = new Map();
  /**
   * A Map to hold the directive configuration
   */
  private modelDirectiveConfig: Map<string, QueryDirectiveConfiguration> = new Map();
  constructor() {
    super('amplify-rds-query-transformer', directiveDefinition);
  }

  field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field: FieldDefinitionNode,
    directive: DirectiveNode,
    context: TransformerSchemaVisitStepContextProvider,
  ): void => {
    if (parent.kind === Kind.INTERFACE_TYPE_DEFINITION) {
      throw new InvalidDirectiveError(
        `The @auth directive cannot be placed on an interface's field. See ${parent.name.value}${field.name.value}`,
      );
    }

    const query = {
      typeName: parent.name.value,
      fieldName: field.name.value,
    };

    this.typesWithQueryDirective.add(query);
    const directiveWrapper = new DirectiveWrapper(directive);
    const { statement } = directiveWrapper.getArguments<{ statement: string }>({ statement: 'SELECT 1 as result' });
    this.queryMap.set(query, statement);
  };

  generateResolvers = (context: TransformerContextProvider): void => {
    const stack = context.stackManager.rootStack;
    this.createModelTable(stack, context);
    this.typesWithQueryDirective.forEach((query) => {
      const statement = this.queryMap.get(query);
      const def = context.output.getObject(query.typeName)!;
      const resolverLogicalId = ResolverResourceIDs.RDSQueryResolverResourceID(query.typeName, query.fieldName);
      const resolver = this.generateQueryResolver(
        context,
        query.typeName,
        query.fieldName,
        resolverLogicalId,
        statement || 'SELECT 1 as result',
      );
      resolver.mapToStack(context.stackManager.getStackFor(resolverLogicalId, def!.name.value));
      context.resolvers.addResolver(query.typeName, query.fieldName, resolver);
    });
  };

  generateQueryResolver = (
    ctx: TransformerContextProvider,
    typeName: string,
    fieldName: string,
    resolverLogicalId: string,
    statement: string,
  ): TransformerResolverProvider => {
    const isSyncEnabled = ctx.isProjectUsingDataStore();
    const dataSource = this.datasourceMap.default;
    const resolverKey = `Query${generateResolverKey(typeName, fieldName)}`;
    if (!this.resolverMap[resolverKey]) {
      this.resolverMap[resolverKey] = ctx.resolvers.generateQueryResolver(
        typeName,
        fieldName,
        resolverLogicalId,
        dataSource,
        MappingTemplate.s3MappingTemplateFromString(generateQueryRequestTemplate(statement), `${typeName}.${fieldName}.req.vtl`),
        MappingTemplate.s3MappingTemplateFromString(generateDefaultResponseMappingTemplate(isSyncEnabled), `${typeName}.${fieldName}.res.vtl`),
      );
    }
    return this.resolverMap[resolverKey];
  };

  private createModelTable(stack: cdk.Stack, context: TransformerContextProvider): void {
    this.createDataSource(context, stack);
  }

  private createDataSource(
    context: TransformerContextProvider,
    stack: cdk.Stack,
  ): void {
    let dataSource;
    if (!context.api.host.hasDataSource('RDSLambdaDataSource')) {
      dataSource = context.api.host.addLambdaDataSource(
        'RDSLambdaDataSource',
        lambda.Function.fromFunctionArn(
          stack,
          'Function',
          'arn:aws:lambda:us-west-2:663595804066:function:rds-poc-lambda',
        ),
        { name: 'RDSLambdaDataSource' },
      );
    } else {
      dataSource = context.api.host.getDataSource('RDSLambdaDataSource');
    }
    this.datasourceMap.default = dataSource as LambdaDataSource;
  }
}
