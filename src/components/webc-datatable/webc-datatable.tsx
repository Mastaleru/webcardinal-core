import { Component, Host, h, Prop, Event, EventEmitter, Method } from '@stencil/core';
import {
  FOR_ATTRIBUTE,
  FOR_OPTIONS,
  FOR_EVENTS,
  FOR_CONTENT_REPLACED_EVENT,
  FOR_CONTENT_UPDATED_EVENT,
  MODEL_CHAIN_PREFIX,
} from '../../constants';
import { HostElement } from '../../decorators';
import { BindingService } from '../../services';
import { promisifyEventEmit } from '../../utils';
import { getPagination } from './webc-datatable.utils';

const DATA_SORTABLE_STYLES = `
[data-sortable] {
    --header-arrow-size: 0.25rem;
    --header-arrow-color: #BBBBBB;

    cursor: pointer;
    position: relative;
    padding-right: calc(5 * var(--header-arrow-size));
}

[data-sortable]::before,
[data-sortable]::after {
    content: "";
    height: 0;
    width: 0;
    position: absolute;
    right: 4px;
    border-left: var(--header-arrow-size) solid transparent;
    border-right: var(--header-arrow-size) solid transparent;
    opacity: 1;
}

[data-sortable]::before {
    border-bottom: var(--header-arrow-size) solid var(--header-arrow-color);
    border-top: var(--header-arrow-size) solid transparent;
    bottom: 55%;
}

[data-sortable]::after {
    border-top: var(--header-arrow-size) solid var(--header-arrow-color);
    top: 55%;
}
`;

/**
 * @slot -
 * @slot before -
 * @slot header -
 * @slot footer -
 * @slot after -
 */
@Component({
  tag: 'webc-datatable',
  styleUrls: {
    default: '../../styles/webc-datatable/webc-datatable.scss',
  },
  shadow: true,
})
export class WebcDatatable {
  @HostElement() host: HTMLElement;

  @Prop({ attribute: 'datasource' }) chain: string;

  @Prop() dataSize: number | undefined;

  @Prop() pageSize: number = 20;

  @Prop() curentPageIndex: number = 0;

  @Prop() hidePagination: boolean = false;

  /**
   * Through this event the model is received.
   */
  @Event({
    eventName: 'webcardinal:model:get',
    bubbles: true,
    composed: true,
    cancelable: true,
  })
  getModelEvent: EventEmitter;

  private dataSource;
  private model;

  private getTemplatesFromDOM = () => {
    const templates = {
      header: [],
      data: [],
    };
    const slots = Object.keys(templates);
    for (const child of Array.from(this.host.children)) {
      if (!child.hasAttribute('slot')) {
        templates['data'].push(child);
        continue;
      }

      if (slots.includes(child.slot)) {
        const { slot } = child;
        child.removeAttribute('slot');
        child.classList.add(`webc-datatable--${slot}`);
        templates[slot].push(child);
      }
    }
    return templates;
  };

  private getDataSourceFromModel = async () => {
    let { chain } = this;

    if (chain.startsWith(MODEL_CHAIN_PREFIX)) {
      chain = chain.substring(1);
    }

    const model = await promisifyEventEmit(this.getModelEvent);
    return model.getChainValue(chain);
  };

  // private storeDataSourceToWindow = () => {
  //   const { page } = window.WebCardinal.state;
  //   if (!page.dataSources) {
  //     page.dataSources = {};
  //   }
  //   if (!page.dataSources[this.datasource]) {
  //     page.dataSources[this.datasource] = this.dataSource;
  //   }
  // };

  private renderPagination = () => {
    const pageIndex = this.curentPageIndex + 1;
    const numberOfPages = this.dataSize ? Math.ceil(this.dataSize / this.pageSize) : 1;

    const result = [];
    const pagination = getPagination(pageIndex, numberOfPages);

    for (const i of pagination) {
      if (typeof i === 'number') {
        if (i === pageIndex) {
          result.push(
            // @ts-ignore
            <button active part="pagination-button pagination-button--active" disabled>
              {i}
            </button>,
          );
          continue;
        }

        result.push(
          <button part="pagination-button" onClick={() => this.dataSource.goToPageByIndex(i - 1)}>
            {i}
          </button>,
        );
        continue;
      }
      if (typeof i === 'string') {
        result.push(i);
      }
    }

    if (numberOfPages !== 1) {
      result.unshift(
        <button
          part="pagination-button pagination-button--previous"
          disabled={pageIndex === 1}
          onClick={() => this.dataSource.goToPreviousPage()}
        >
          {'‹'}
        </button>,
      );

      result.push(
        <button
          part="pagination-button pagination-button--next"
          disabled={pageIndex === numberOfPages}
          onClick={() => this.dataSource.goToNextPage()}
        >
          {'›'}
        </button>,
      );
    }

    return result;
  };

  async componentWillLoad() {
    if (!this.host.isConnected) {
      return;
    }

    this.dataSource = await this.getDataSourceFromModel();
    const { DataSource } = window.WebCardinal.dataSources;
    if (!this.dataSource || typeof this.dataSource !== 'object' || !(this.dataSource instanceof DataSource)) {
      console.error(`An invalid WebCardinal DataSource instance received: "${this.chain}"! [1]`, this.dataSource);
      return;
    }

    try {
      this.model = await this.dataSource._init(() => this.host);
    } catch (error) {
      console.error(`An invalid WebCardinal DataSource instance received: "${this.chain}"! [2]`, this.dataSource);
      this.dataSource = undefined;
      return;
    }

    const { header, data } = this.getTemplatesFromDOM();

    this.host.classList.add('webc-datatable');

    const dataSortableStyles = document.createElement('style');
    dataSortableStyles.innerHTML = DATA_SORTABLE_STYLES;

    const dataTable = document.createElement('div');
    dataTable.setAttribute('slot', 'data');
    dataTable.classList.add('webc-datatable--container');
    dataTable.setAttribute(FOR_ATTRIBUTE, `${MODEL_CHAIN_PREFIX}data`);
    dataTable.setAttribute(FOR_OPTIONS, `${FOR_EVENTS}`);
    dataTable.append(...data);
    dataTable.addEventListener(FOR_CONTENT_REPLACED_EVENT, event => {
      event.stopImmediatePropagation();
      dataTable.prepend(...header);
    });
    dataTable.addEventListener(FOR_CONTENT_UPDATED_EVENT, event => {
      event.stopImmediatePropagation();
    });

    this.host.append(dataSortableStyles, dataTable);

    BindingService.bindChildNodes(this.host, {
      model: this.model,
      translationModel: {},
      recursive: true,
      enableTranslations: false,
    });

    dataTable.prepend(...header);

    this.dataSource._renderPageAsync();
  }

  @Method()
  async fillCurrentPage(data) {
    this.model.data = data;
  }

  @Method()
  async clearCurrentPage() {
    this.model.data.length = 0;
  }

  render() {
    return this.dataSource ? (
      <Host>
        <slot name="before" />
        <slot name="data" />
        {this.hidePagination ? null : (
          <div part="pagination" class="pagination">
            {this.renderPagination()}
          </div>
        )}
        <slot name="footer" />
        <slot name="after" />
      </Host>
    ) : null;
  }
}
